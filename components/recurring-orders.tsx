"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers"
import { CalendarClock, ExternalLink, Loader2, Repeat, Search, X } from "lucide-react"
import { getTokenBySymbol, type Token } from "@/lib/tokens"
import { wrapCRO } from "@/lib/swap"
import {
  MAX_RUNS,
  MIN_RUNS,
  RUN_PRESETS,
  cancelOrderMessage,
  recurringOrderMessage,
  type RecurringOrder,
  type RecurringSide,
  type RecurringState,
} from "@/lib/recurring"

const ERC20 = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]
const CRO_GAS_RESERVE = parseUnits("1", 18)

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<RecurringState>)

type Props = { tokens: Token[]; account: string | null; onConnect: () => void }

function errorText(e: unknown): string {
  const err = e as { reason?: string; shortMessage?: string; message?: string }
  const raw = err?.reason || err?.shortMessage || err?.message || "Something went wrong"
  if (/user rejected|denied|action_rejected/i.test(raw)) return "Rejected in wallet."
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumSignificantDigits: 6 })
}

function TokenAvatar({ token }: { token: Token }) {
  const [failed, setFailed] = useState(false)
  if (token.logoURI && !failed) {
    return <img src={token.logoURI} alt="" className="h-7 w-7 shrink-0 rounded-full bg-white/5 object-cover" onError={() => setFailed(true)} />
  }
  return <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-xs font-black">{token.symbol.slice(0, 2)}</div>
}

export function RecurringOrders({ tokens, account, onConnect }: Props) {
  const key = account ? `/api/recurring?address=${account}` : "/api/recurring"
  const { data, mutate } = useSWR(key, fetcher, { refreshInterval: 30_000 })
  const keeper = data?.keeper ?? null
  const orders = data?.orders ?? []
  const runHour = data?.runHourUtc ?? 14

  const [side, setSide] = useState<RecurringSide>("buy")
  const [token, setToken] = useState<Token | null>(null)
  const [query, setQuery] = useState("")
  const [picking, setPicking] = useState(false)
  const [amount, setAmount] = useState("")
  const [runs, setRuns] = useState(30)
  const [slippage, setSlippage] = useState("1")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null)

  const wcro = getTokenBySymbol("WCRO")
  const pickable = useMemo(() => {
    const wcroLower = wcro?.address.toLowerCase()
    const q = query.trim().toLowerCase()
    return tokens
      .filter((t) => !t.isNative && t.address.toLowerCase() !== wcroLower)
      .filter((t) => !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q)
      .slice(0, 40)
  }, [tokens, query, wcro?.address])

  const perRun = Number(amount)
  const validAmount = Number.isFinite(perRun) && perRun > 0
  const validRuns = Number.isInteger(runs) && runs >= MIN_RUNS && runs <= MAX_RUNS
  const slippageBps = Math.round(Number(slippage) * 100)
  const validSlippage = Number.isFinite(slippageBps) && slippageBps >= 10 && slippageBps <= 2000
  const spendUnit = side === "buy" ? "CRO" : token?.symbol ?? "tokens"
  const endDate = useMemo(() => {
    const now = new Date()
    const firstSlot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), runHour))
    if (firstSlot <= now) firstSlot.setUTCDate(firstSlot.getUTCDate() + 1)
    firstSlot.setUTCDate(firstSlot.getUTCDate() + Math.max(0, runs - 2))
    return firstSlot
  }, [runs, runHour])

  const tokenInFor = (s: RecurringSide, tokenAddress: string) => (s === "buy" ? wcro!.address : tokenAddress).toLowerCase()

  // What other active orders still need from the same input token, in wei.
  const committedFor = (tokenIn: string, excludeId?: number) =>
    orders
      .filter((o) => o.status === "active" && o.id !== excludeId && tokenInFor(o.side, o.tokenAddress) === tokenIn)
      .reduce((sum, o) => sum + parseUnits(o.amountPerRun, o.side === "buy" ? 18 : o.tokenDecimals) * BigInt(o.runsTotal - o.runsDone), BigInt(0))

  const getSigner = async () => {
    const ethereum = (window as Window & { ethereum?: unknown }).ethereum
    if (!ethereum) throw new Error("Install a compatible wallet to continue.")
    const provider = new BrowserProvider(ethereum as ConstructorParameters<typeof BrowserProvider>[0])
    return { provider, signer: await provider.getSigner() }
  }

  const submit = async () => {
    if (!account) return onConnect()
    if (!keeper || !wcro || !token || !validAmount || !validRuns || !validSlippage || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const { provider, signer } = await getSigner()
      const tokenIn = side === "buy" ? wcro.address : token.address
      const inDecimals = side === "buy" ? 18 : token.decimals
      const perRunWei = parseUnits(amount, inDecimals)
      const required = committedFor(tokenIn.toLowerCase()) + perRunWei * BigInt(runs)
      const inContract = new Contract(tokenIn, ERC20, signer)

      const balance: bigint = await inContract.balanceOf(account)
      if (balance < required) {
        if (side === "sell") throw new Error(`You need ${fmt(Number(formatUnits(required, inDecimals)))} ${token.symbol} to cover every run.`)
        const shortfall = required - balance
        const croBalance = await provider.getBalance(account)
        if (croBalance < shortfall + CRO_GAS_RESERVE) {
          throw new Error(`Not enough CRO. This plan needs ${fmt(Number(formatUnits(shortfall, 18)))} CRO plus about 1 CRO for gas.`)
        }
        setStatus({ tone: "info", text: "Step 1 of 3: confirm wrapping your CRO budget into WCRO…" })
        await provider.waitForTransaction(await wrapCRO(formatUnits(shortfall, 18), signer))
      }

      const allowance: bigint = await inContract.allowance(account, keeper)
      if (allowance < required) {
        setStatus({ tone: "info", text: `Step 2 of 3: approve the keeper to spend up to ${fmt(Number(formatUnits(required, inDecimals)))} ${side === "buy" ? "WCRO" : token.symbol}…` })
        await (await inContract.approve(keeper, required)).wait()
      }

      setStatus({ tone: "info", text: "Step 3 of 3: sign the order (free, no gas)…" })
      const issuedAt = new Date().toISOString()
      const terms = { owner: account, side, tokenAddress: token.address, tokenSymbol: token.symbol, amountPerRun: amount, runs, slippageBps, keeper, issuedAt }
      const signature = await signer.signMessage(recurringOrderMessage(terms))

      const res = await fetch("/api/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...terms, signature }) })
      const out = await res.json().catch(() => null)
      if (!res.ok) throw new Error(out?.error || "Could not create the order")

      setStatus({ tone: "ok", text: `Plan started. The first ${side} runs now, then daily at ${runHour}:00 UTC.` })
      setAmount("")
      mutate()
      setTimeout(() => mutate(), 20_000)
    } catch (e) {
      setStatus({ tone: "error", text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (order: RecurringOrder) => {
    if (!account || !keeper || !wcro || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const { signer } = await getSigner()
      const issuedAt = new Date().toISOString()
      const signature = await signer.signMessage(cancelOrderMessage(account, order.id, issuedAt))
      const res = await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: account, id: order.id, issuedAt, signature }) })
      const out = await res.json().catch(() => null)
      if (!res.ok) throw new Error(out?.error || "Could not cancel the order")
      mutate()

      // Shrink the keeper's allowance to what remaining active orders still need.
      const tokenIn = tokenInFor(order.side, order.tokenAddress)
      const remaining = committedFor(tokenIn, order.id)
      const inContract = new Contract(tokenIn, ERC20, signer)
      const allowance: bigint = await inContract.allowance(account, keeper)
      if (allowance > remaining) {
        setStatus({ tone: "info", text: "Order cancelled. Optional: confirm to remove the leftover keeper allowance…" })
        try {
          await (await inContract.approve(keeper, remaining)).wait()
        } catch {
          /* optional step; the order is already cancelled */
        }
      }
      setStatus({ tone: "ok", text: order.side === "buy" ? "Order cancelled. Unused WCRO stays in your wallet." : "Order cancelled." })
    } catch (e) {
      setStatus({ tone: "error", text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const accent = side === "buy" ? "#d6ff2b" : "#ff2d95"
  const canSubmit = !!keeper && !!token && validAmount && validRuns && validSlippage && !busy

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[#22e4ff]/20 bg-[#120a1c]/80 p-5 backdrop-blur">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <Repeat size={16} className="text-[#22e4ff]" /> New recurring plan
          </div>
          <div role="radiogroup" aria-label="Order side" className="flex rounded-md border border-white/10 p-1">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={side === s}
                onClick={() => setSide(s)}
                className={`rounded px-4 py-1.5 font-display text-xs font-black uppercase tracking-wider transition ${side === s ? (s === "buy" ? "bg-[#d6ff2b] text-[#11140a]" : "bg-[#ff2d95] text-white") : "text-slate-300 hover:text-white"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {!keeper && data && (
          <p className="mb-4 rounded-md border border-[#d6ff2b]/25 bg-[#d6ff2b]/[0.06] px-3 py-2 text-sm leading-6 text-[#d6ff2b]">
            Recurring orders are being switched on. You can set up a plan as soon as the keeper is live.
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div className="relative">
            <span className="mb-1.5 block font-display text-xs uppercase tracking-wider text-slate-300">{side === "buy" ? "Token to buy" : "Token to sell"}</span>
            <button
              onClick={() => setPicking((p) => !p)}
              aria-expanded={picking}
              className="flex w-full items-center gap-3 rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-left transition hover:border-[#22e4ff]/40"
            >
              {token ? <TokenAvatar token={token} /> : <Search size={16} className="text-slate-400" />}
              <span className={token ? "font-bold" : "text-sm text-slate-400"}>{token ? token.symbol : "Choose a token"}</span>
              {token && <span className="truncate text-xs text-slate-400">{token.name}</span>}
            </button>
            {picking && (
              <div className="absolute z-20 mt-2 w-full rounded-md border border-[#22e4ff]/30 bg-[#0d0716] p-2 shadow-2xl">
                <div className="mb-2 flex items-center gap-2 rounded border border-white/10 px-2 py-1.5">
                  <Search size={14} className="text-slate-400" />
                  <input
                    autoFocus
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search token, name, or address"
                    aria-label="Search tokens"
                    className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} className="text-slate-300" /></button>}
                </div>
                <ul className="max-h-64 overflow-y-auto">
                  {pickable.length === 0 && <li className="px-2 py-3 text-sm text-slate-400">No tokens found.</li>}
                  {pickable.map((t) => (
                    <li key={t.address}>
                      <button
                        onClick={() => { setToken(t); setPicking(false); setQuery("") }}
                        className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-white/5"
                      >
                        <TokenAvatar token={t} />
                        <span className="font-bold">{t.symbol}</span>
                        <span className="truncate text-xs text-slate-400">{t.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block font-display text-xs uppercase tracking-wider text-slate-300">{side === "buy" ? "CRO to spend each day" : `${token?.symbol ?? "Tokens"} to sell each day`}</span>
            <div className="flex items-center rounded-md border border-white/10 bg-black/30 px-3 focus-within:border-[#22e4ff]/50">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.0"
                className="w-full min-w-0 bg-transparent py-2.5 font-display text-lg font-black outline-none placeholder:text-slate-400"
              />
              <span className="font-display text-xs font-bold text-slate-300">{spendUnit}</span>
            </div>
          </label>

          <div>
            <span className="mb-1.5 block font-display text-xs uppercase tracking-wider text-slate-300">Number of days</span>
            <div className="flex flex-wrap items-center gap-2">
              {RUN_PRESETS.map((n) => (
                <button
                  key={n}
                  onClick={() => setRuns(n)}
                  aria-pressed={runs === n}
                  className={`rounded-md border px-3 py-1.5 font-display text-xs font-bold transition ${runs === n ? "border-[#22e4ff] bg-[#22e4ff]/15 text-[#22e4ff]" : "border-white/10 text-slate-300 hover:text-white"}`}
                >
                  {n}d
                </button>
              ))}
              <input
                type="number"
                min={MIN_RUNS}
                max={MAX_RUNS}
                value={runs}
                onChange={(e) => setRuns(Math.floor(Number(e.target.value)))}
                aria-label="Custom number of days"
                className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-[#22e4ff]/50"
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="font-display text-xs uppercase tracking-wider text-slate-300">Max slippage per run</span>
            <div className="flex items-center rounded-md border border-white/10 bg-black/30 px-2">
              <input
                inputMode="decimal"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-12 bg-transparent py-1.5 text-right text-sm outline-none"
              />
              <span className="text-sm text-slate-300">%</span>
            </div>
          </label>
        </div>

        <div className="mt-5 rounded-md border border-white/10 bg-black/30 p-3 text-sm leading-6 text-slate-300">
          {token && validAmount && validRuns ? (
            <>
              <p>
                {side === "buy" ? "Buy" : "Sell"} <strong className="text-white">{fmt(perRun)} {spendUnit}</strong> {side === "buy" ? `of ${token.symbol}` : "for CRO"} every day for{" "}
                <strong className="text-white">{runs} days</strong>.
              </p>
              <p className="text-slate-300">
                Total budget {fmt(perRun * runs)} {spendUnit}. First run now, then daily at {runHour}:00 UTC until about {endDate.toLocaleDateString()}.
              </p>
            </>
          ) : (
            <p className="text-slate-300">Pick a token, a daily amount, and how many days to run.</p>
          )}
        </div>

        <button
          onClick={submit}
          disabled={account ? !canSubmit : false}
          style={{ backgroundColor: accent }}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-md py-3 font-display text-sm font-black uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 ${side === "buy" ? "text-[#11140a]" : "text-white"}`}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {!account ? "Connect wallet" : `Start recurring ${side}`}
        </button>

        {status && (
          <p
            role="status"
            className={`mt-3 text-sm leading-6 ${status.tone === "error" ? "text-[#ff6b9d]" : status.tone === "ok" ? "text-[#d6ff2b]" : "text-[#22e4ff]"}`}
          >
            {status.text}
          </p>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-400">
          You sign once. A keeper wallet runs each daily trade from a capped allowance, and the output goes straight to your wallet. The usual 1% fee applies to each run. Cancel anytime.
        </p>
      </div>

      {account && (
        <div className="rounded-lg border border-white/10 bg-[#120a1c]/80 p-5 backdrop-blur">
          <div className="mb-4 flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <CalendarClock size={16} className="text-[#ff2d95]" /> Your plans
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-400">No recurring plans yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} busy={busy} onCancel={() => cancel(o)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<RecurringOrder["status"], string> = {
  active: "border-[#22e4ff]/40 text-[#22e4ff]",
  completed: "border-[#d6ff2b]/40 text-[#d6ff2b]",
  cancelled: "border-white/15 text-slate-300",
  failed: "border-[#ff2d95]/40 text-[#ff6b9d]",
}

function OrderRow({ order, busy, onCancel }: { order: RecurringOrder; busy: boolean; onCancel: () => void }) {
  const unit = order.side === "buy" ? "CRO" : order.tokenSymbol
  const pct = Math.round((order.runsDone / order.runsTotal) * 100)
  return (
    <li className="rounded-md border border-white/10 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">
            <span className={order.side === "buy" ? "text-[#d6ff2b]" : "text-[#ff2d95]"}>{order.side === "buy" ? "Buy" : "Sell"}</span>{" "}
            {order.side === "buy" ? `${order.tokenSymbol} with ${fmt(Number(order.amountPerRun))} ${unit}` : `${fmt(Number(order.amountPerRun))} ${unit} for CRO`}
            <span className="font-normal text-slate-400"> / day</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {order.status === "active" ? `Next run ${new Date(order.nextRunAt).toLocaleString()}` : `Started ${new Date(order.createdAt).toLocaleDateString()}`}
          </div>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wider ${STATUS_STYLE[order.status]}`}>{order.status}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={order.runsDone} aria-valuemin={0} aria-valuemax={order.runsTotal} aria-label="Runs completed">
          <div className="h-full rounded-full bg-[#22e4ff]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-slate-300">{order.runsDone}/{order.runsTotal}</span>
      </div>

      {order.lastError && order.status !== "completed" && <p className="mt-2 text-xs leading-5 text-[#ff6b9d]">Last run failed: {order.lastError}</p>}

      <div className="mt-2 flex items-center justify-between gap-3">
        {order.lastTx ? (
          <a href={`https://explorer.cronos.org/tx/${order.lastTx}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#22e4ff] hover:underline">
            Last trade <ExternalLink size={12} />
          </a>
        ) : <span />}
        {order.status === "active" && (
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-[#ff2d95]/40 px-3 py-1 font-display text-xs font-bold uppercase tracking-wider text-[#ff6b9d] transition hover:bg-[#ff2d95]/10 disabled:opacity-40">
            Cancel
          </button>
        )}
      </div>
    </li>
  )
}
