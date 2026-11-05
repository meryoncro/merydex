"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { BrowserProvider, type TypedDataField } from "ethers"
import { ArrowDown, ChevronDown, ExternalLink, Loader2, X } from "lucide-react"
import { ETH_CHAIN_ID, ETH_EXPLORER, ETH_GAS_RESERVE, ETH_TOKENS } from "@/lib/eth"
import { ensureChain, getEthereum } from "@/lib/wallet-provider"
import { emitFx } from "@/lib/fx"
import type { Token } from "@/lib/tokens"

const PERCENT_PRESETS = [25, 50, 75, 100]
const SLIPPAGE_PRESETS = ["0.5", "1", "3"]

type QuoteResult = {
  amountOut: string
  minAmountOut: string
  feeAmount: string | null
  feeBps: number
  gasFeeUSD: number | null
  priceImpact: number | null
  route: string | null
  quote: unknown
  permitData: { domain: Record<string, unknown>; types: Record<string, TypedDataField[]>; values: Record<string, unknown> } | null
}
type Tx = { to: string; data: string; value?: string; gasLimit?: string }

const postJson = async <T,>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || "Request failed")
  return data as T
}
const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Request failed")
  return res.json()
}

const fmt = (value: string | number | null | undefined, digits = 6) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  if (n === 0) return "0"
  if (n < 0.000001) return "<0.000001"
  return n.toLocaleString(undefined, { maximumSignificantDigits: digits })
}

// Trims to the token's decimals so parseUnits never sees too many fraction digits.
const toAmountString = (n: number, decimals: number) => {
  if (!Number.isFinite(n) || n <= 0) return ""
  const fixed = n.toFixed(Math.min(decimals, 12))
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed
}

const keyOf = (t: Token) => (t.isNative ? "native" : t.address.toLowerCase())

interface EthSwapBoxProps {
  account: string | null
  slippage: string
  setSlippage: (value: string) => void
  onConnect: () => void
}

export function EthSwapBox({ account, slippage, setSlippage, onConnect }: EthSwapBoxProps) {
  const [fromToken, setFromToken] = useState<Token>(ETH_TOKENS[0])
  const [toToken, setToToken] = useState<Token>(ETH_TOKENS[1])
  const [amount, setAmount] = useState("")
  const [debounced, setDebounced] = useState("")
  const [picking, setPicking] = useState<"from" | "to" | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: "info" | "ok" | "err"; text: string; hash?: string } | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(amount), 400)
    return () => clearTimeout(id)
  }, [amount])

  const { data: balanceData, mutate: refreshBalances } = useSWR<{ balances: Record<string, string> }>(
    account ? `/api/eth/balances?address=${account}` : null,
    getJson,
    { refreshInterval: 30000 },
  )
  const balances = balanceData?.balances
  const fromBalance = balances ? Number(balances[keyOf(fromToken)] ?? 0) : null
  const toBalance = balances ? Number(balances[keyOf(toToken)] ?? 0) : null

  const validAmount = Number(debounced) > 0 ? debounced : null
  const quoteKey = validAmount ? ["eth-quote", fromToken.address, toToken.address, validAmount, account ?? "", slippage] : null
  const { data: quote, error: quoteError, isLoading: quoting } = useSWR<QuoteResult>(
    quoteKey,
    () => postJson<QuoteResult>("/api/eth/quote", { tokenIn: fromToken.address, tokenOut: toToken.address, amount: validAmount, swapper: account, slippage: Number(slippage) }),
    { refreshInterval: 20000, keepPreviousData: false, shouldRetryOnError: false },
  )

  const amountNum = Number(amount)
  const insufficient = fromBalance != null && amountNum > 0 && amountNum + (fromToken.isNative ? ETH_GAS_RESERVE : 0) > fromBalance

  const setPercent = (p: number) => {
    if (fromBalance == null) return
    const usable = fromToken.isNative ? Math.max(fromBalance - ETH_GAS_RESERVE, 0) : fromBalance
    setAmount(toAmountString((usable * p) / 100, fromToken.decimals))
  }

  const flip = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setAmount(quote ? toAmountString(Number(quote.amountOut), toToken.decimals) : "")
  }

  const choose = (t: Token) => {
    if (picking === "from") {
      if (t.address === toToken.address) setToToken(fromToken)
      setFromToken(t)
    } else {
      if (t.address === fromToken.address) setFromToken(toToken)
      setToToken(t)
    }
    setPicking(null)
  }

  const swap = async () => {
    if (!account) { onConnect(); return }
    const ethereum = getEthereum()
    if (!ethereum || busy || !(amountNum > 0)) return
    setBusy(true)
    try {
      setStatus({ kind: "info", text: "Switching wallet to Ethereum…" })
      await ensureChain(ETH_CHAIN_ID)
      const provider = new BrowserProvider(ethereum as ConstructorParameters<typeof BrowserProvider>[0])
      const signer = await provider.getSigner()
      const send = async (tx: Tx, label: string) => {
        setStatus({ kind: "info", text: `Confirm ${label} in your wallet…` })
        const sent = await signer.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : BigInt(0),
          ...(tx.gasLimit ? { gasLimit: BigInt(tx.gasLimit) } : {}),
        })
        setStatus({ kind: "info", text: `Waiting for ${label} to confirm…`, hash: sent.hash })
        await sent.wait()
        return sent.hash
      }

      if (!fromToken.isNative) {
        setStatus({ kind: "info", text: `Checking ${fromToken.symbol} approval…` })
        const check = await postJson<{ approval: Tx | null; cancel: Tx | null }>("/api/eth/approval", { walletAddress: account, token: fromToken.address, amount })
        if (check.cancel) await send(check.cancel, `${fromToken.symbol} approval reset`)
        if (check.approval) await send(check.approval, `${fromToken.symbol} approval`)
      }

      setStatus({ kind: "info", text: "Getting a fresh Uniswap quote…" })
      const fresh = await postJson<QuoteResult>("/api/eth/quote", { tokenIn: fromToken.address, tokenOut: toToken.address, amount, swapper: account, slippage: Number(slippage) })

      let signature: string | undefined
      if (fresh.permitData) {
        setStatus({ kind: "info", text: "Sign the Permit2 message in your wallet…" })
        const { EIP712Domain: _domain, ...types } = fresh.permitData.types
        signature = await signer.signTypedData(fresh.permitData.domain, types, fresh.permitData.values)
      }

      setStatus({ kind: "info", text: "Building swap transaction…" })
      const { swap: tx } = await postJson<{ swap: Tx }>("/api/eth/swap", { quote: fresh.quote, permitData: fresh.permitData, signature })
      const hash = await send(tx, "swap")

      const label = `${fmt(amount)} ${fromToken.symbol} → ~${fmt(fresh.amountOut, 5)} ${toToken.symbol}`
      setStatus({ kind: "ok", text: `Done on Ethereum: ${label}`, hash })
      emitFx({ kind: fromToken.isNative ? "buy" : toToken.isNative ? "sell" : "swap", label })
      setAmount("")
      refreshBalances()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Swap failed."
      const cancelled = /user rejected|denied|ACTION_REJECTED|cancel/i.test(message)
      setStatus({ kind: "err", text: cancelled ? "Cancelled in wallet." : message.split(" (")[0] })
    } finally {
      setBusy(false)
    }
  }

  const buttonLabel = !account
    ? "Connect wallet"
    : busy
      ? "Swapping…"
      : !(amountNum > 0)
        ? "Enter an amount"
        : insufficient
          ? `Not enough ${fromToken.symbol}`
          : quoteError
            ? "No route"
            : `Swap ${fromToken.symbol} for ${toToken.symbol}`

  const quoteText = quoting && !quote ? "" : quote ? toAmountString(Number(quote.amountOut), Math.min(toToken.decimals, 8)) : ""

  return (
    <div className="arcade-panel rounded-2xl border bg-[#171230]/95 p-3 backdrop-blur sm:p-4" id="swap-box">
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-[#0d0a1c] px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2 rounded-full bg-[#627eea]" aria-hidden="true" />
          Ethereum
          <span className="text-xs font-normal text-slate-400">via Uniswap</span>
        </p>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className="rounded-lg px-2 py-1 text-xs text-slate-300 transition hover:bg-white/5 hover:text-[#29e6ff]"
        >
          Slippage {slippage}%
        </button>
      </div>

      {showSettings && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#0d0a1c] p-2" role="group" aria-label="Slippage tolerance">
          {SLIPPAGE_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlippage(s)}
              aria-pressed={slippage === s}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${slippage === s ? "bg-[#29e6ff] text-[#0b0816]" : "text-slate-300 hover:bg-white/5"}`}
            >
              {s}%
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center">
        <AmountRow
          label="You pay"
          token={fromToken}
          balance={fromBalance}
          onPick={() => setPicking("from")}
          value={amount}
          onChange={setAmount}
          footer={
            account && fromBalance != null ? (
              <div className="flex gap-1.5">
                {PERCENT_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setPercent(p)} className="rounded-md bg-white/5 px-2 py-1 text-xs font-semibold text-slate-300 transition hover:bg-[#29e6ff]/15 hover:text-[#29e6ff]">
                    {p === 100 ? "Max" : `${p}%`}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
        <button
          type="button"
          onClick={flip}
          aria-label="Flip tokens"
          className="group z-10 -my-3 rounded-xl border-4 border-[#171230] bg-[#221a44] p-2 text-[#29e6ff] transition hover:bg-[#29e6ff] hover:text-[#0b0816]"
        >
          <ArrowDown size={18} aria-hidden="true" />
        </button>
        <AmountRow
          label="You receive"
          token={toToken}
          balance={toBalance}
          onPick={() => setPicking("to")}
          value={quoteText}
          loading={quoting && !quote && Boolean(validAmount)}
          readOnly
        />
      </div>

      {quote && amountNum > 0 && (
        <dl className="mt-2 flex flex-col gap-1.5 rounded-xl bg-[#0d0a1c] p-3 text-xs">
          <Detail label="Minimum received" value={`${fmt(quote.minAmountOut)} ${toToken.symbol}`} />
          <Detail label={`Platform fee (${quote.feeBps / 100}%)`} value={quote.feeAmount ? `${fmt(quote.feeAmount)} ${toToken.symbol}` : "—"} />
          <Detail label="Network fee" value={quote.gasFeeUSD != null ? `~$${quote.gasFeeUSD.toFixed(2)}` : "—"} />
          {quote.priceImpact != null && (
            <Detail label="Price impact" value={`${quote.priceImpact.toFixed(2)}%`} warn={quote.priceImpact > 3} />
          )}
          {quote.route && <Detail label="Route" value={quote.route} />}
        </dl>
      )}
      {quoteError && amountNum > 0 && <p className="mt-2 text-center text-xs text-[#ff3d7f]">{quoteError.message}</p>}

      <button
        type="button"
        onClick={swap}
        disabled={Boolean(account) && (busy || !(amountNum > 0) || insufficient || Boolean(quoteError) || !quote)}
        className="arcade-btn mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#29e6ff] py-4 font-display text-base font-bold text-[#0b0816] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
        {buttonLabel}
      </button>

      {status && (
        <p
          role="status"
          className={`mt-3 flex flex-wrap items-center justify-center gap-x-2 text-center text-sm ${status.kind === "err" ? "text-[#ff3d7f]" : status.kind === "ok" ? "text-[#29e6ff]" : "text-slate-300"}`}
        >
          {status.text}
          {status.hash && (
            <a href={`${ETH_EXPLORER}/tx/${status.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
              Etherscan <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </p>
      )}

      {picking && <EthTokenPicker exclude={picking === "from" ? fromToken : toToken} balances={balances} onPick={choose} onClose={() => setPicking(null)} />}
    </div>
  )
}

function Detail({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-right font-mono ${warn ? "text-[#ff3d7f]" : "text-slate-200"}`}>{value}</dd>
    </div>
  )
}

interface AmountRowProps {
  label: string
  token: Token
  balance: number | null
  value: string
  onPick: () => void
  onChange?: (v: string) => void
  readOnly?: boolean
  loading?: boolean
  footer?: React.ReactNode
}

function AmountRow({ label, token, balance, value, onPick, onChange, readOnly, loading, footer }: AmountRowProps) {
  const id = `eth-${label.replace(/\s+/g, "-").toLowerCase()}`
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-[#0d0a1c] p-4 transition focus-within:border-[#29e6ff]/60">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <label htmlFor={id}>{label}</label>
        {balance != null && <span>Balance: {fmt(balance)}</span>}
      </div>
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="flex flex-1 items-center gap-2 text-slate-500"><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Quoting…</div>
        ) : (
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            readOnly={readOnly}
            value={value}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".")
              if (/^\d*\.?\d*$/.test(v)) onChange?.(v)
            }}
            className="min-w-0 flex-1 bg-transparent font-display text-3xl font-bold text-slate-100 outline-none placeholder:text-slate-600"
          />
        )}
        <button
          type="button"
          onClick={onPick}
          className="flex shrink-0 items-center gap-2 rounded-full bg-white/5 py-1.5 pl-1.5 pr-3 font-semibold transition hover:bg-white/10"
          aria-label={`Select token, current ${token.symbol}`}
        >
          <EthTokenLogo token={token} />
          {token.symbol}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {footer}
    </div>
  )
}

function EthTokenLogo({ token, size = 28 }: { token: Token; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (!token.logoURI || failed) {
    return (
      <span
        className="flex items-center justify-center rounded-full text-xs font-bold text-slate-100"
        style={{ width: size, height: size, backgroundColor: token.color }}
        aria-hidden="true"
      >
        {token.symbol.slice(0, 1)}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={token.logoURI} alt="" width={size} height={size} className="rounded-full" onError={() => setFailed(true)} />
  )
}

function EthTokenPicker({ exclude, balances, onPick, onClose }: { exclude: Token; balances?: Record<string, string>; onPick: (t: Token) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0816]/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select an Ethereum token"
        className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#29e6ff]/30 bg-[#110d22]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="font-display text-lg font-bold">Ethereum tokens</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-100">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ul className="overflow-y-auto p-2">
          {ETH_TOKENS.map((t) => {
            const bal = balances ? Number(balances[keyOf(t)] ?? 0) : null
            const current = t.address === exclude.address
            return (
              <li key={t.address}>
                <button
                  type="button"
                  onClick={() => onPick(t)}
                  aria-current={current || undefined}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-white/5 ${current ? "bg-[#29e6ff]/10" : ""}`}
                >
                  <EthTokenLogo token={t} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="truncate text-xs text-slate-400">{t.name}</span>
                  </span>
                  {bal != null && bal > 0 && <span className="font-mono text-sm text-slate-300">{fmt(bal)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
