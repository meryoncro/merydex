"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowDownUp, ChevronDown, Loader2, Search, Settings2, X } from "lucide-react"
import { getRoutingAddress, getTokenLogoUrl, type Token } from "@/lib/tokens"
import { isWrapPair } from "@/lib/swap"
import { formatBalance, type BalanceMap } from "@/lib/balances"
import { isMery } from "@/lib/score"

export type SwapMode = "buy" | "sell"
export type SwapSizing = { amount: string } | { percent: number }

const CRO_GAS_RESERVE = 0.5
const BUY_PRESETS = ["10", "50", "100", "500"]
const SELL_PRESETS = [25, 50, 75, 100]
const SLIPPAGE_PRESETS = ["0.5", "1", "3"]

interface SwapBoxProps {
  tokens: Token[]
  cro: Token
  token: Token | null
  mode: SwapMode
  onTokenChange: (token: Token) => void
  onModeChange: (mode: SwapMode) => void
  account: string | null
  balances: BalanceMap
  balancesLoading: boolean
  swapping: boolean
  slippage: string
  setSlippage: (value: string) => void
  onSwap: (from: Token, to: Token, sizing: SwapSizing) => void
  onConnect: () => void
}

interface QuoteResult { amountOut: string; route: string[] }

const balanceOf = (balances: BalanceMap, token: Token) =>
  Number(token.isNative ? balances.native ?? 0 : balances[token.address.toLowerCase()] ?? 0)

const trimAmount = (n: number, decimals: number) => {
  if (!Number.isFinite(n) || n <= 0) return ""
  const digits = Math.min(decimals, n >= 1 ? 4 : 8)
  return n.toFixed(digits).replace(/\.?0+$/, "")
}

const formatOut = (value: number) =>
  value >= 1 ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : value.toLocaleString(undefined, { maximumSignificantDigits: 6 })

async function fetchQuote([, from, to, amount]: [string, Token, Token, string]): Promise<QuoteResult> {
  if (isWrapPair(from, to)) return { amountOut: amount, route: ["Wrap"] }
  const res = await fetch("/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromAddress: getRoutingAddress(from),
      toAddress: getRoutingAddress(to),
      fromDecimals: from.decimals,
      toDecimals: to.decimals,
      amountIn: amount,
      nativeIn: Boolean(from.isNative),
      nativeOut: Boolean(to.isNative),
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.amountOut) throw new Error(data?.error || "No route")
  return { amountOut: data.amountOut, route: data.route ?? [] }
}

export function SwapBox(props: SwapBoxProps) {
  const { tokens, cro, token, mode, onTokenChange, onModeChange, account, balances, balancesLoading, swapping, slippage, setSlippage, onSwap, onConnect } = props
  const [amount, setAmount] = useState("")
  const [percent, setPercent] = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [debounced, setDebounced] = useState("")

  const from = mode === "buy" ? cro : token
  const to = mode === "buy" ? token : cro
  const fromBalance = from ? balanceOf(balances, from) : 0
  const toBalance = to ? balanceOf(balances, to) : 0

  useEffect(() => {
    setAmount(mode === "buy" ? "50" : "")
    setPercent(null)
  }, [mode, token?.address])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 400)
    return () => clearTimeout(t)
  }, [amount])

  const amountNum = Number(amount)
  const validAmount = amountNum > 0 && Number.isFinite(amountNum)
  const quoteKey = from && to && Number(debounced) > 0 ? (["quote", from, to, debounced] as [string, Token, Token, string]) : null
  const { data: quote, error: quoteError, isLoading: quoteLoading } = useSWR(quoteKey, fetchQuote, {
    refreshInterval: 15000,
    shouldRetryOnError: false,
    keepPreviousData: true,
  })
  const quoteFresh = debounced === amount
  const out = quote && quoteFresh ? Number(quote.amountOut) : null
  const slippagePct = Number(slippage || "1")
  const minOut = out != null ? out * (1 - slippagePct / 100) : null
  const rate = out != null && validAmount ? out / amountNum : null

  const maxSpend = from?.isNative ? Math.max(0, fromBalance - CRO_GAS_RESERVE) : fromBalance
  const insufficient = account != null && validAmount && percent !== 100 && amountNum > maxSpend + 1e-12

  const setPresetAmount = (v: string) => { setAmount(v); setPercent(null) }
  const setPresetPercent = (p: number) => {
    if (!from) return
    const base = from.isNative ? maxSpend : fromBalance
    setAmount(trimAmount((base * p) / 100, from.decimals))
    setPercent(p)
  }

  const submit = () => {
    if (!account) return onConnect()
    if (!from || !to || !validAmount || insufficient) return
    onSwap(from, to, percent === 100 && !from.isNative ? { percent: 100 } : { amount })
  }

  const label = !account
    ? "Connect wallet"
    : !token
      ? "Select a token"
      : !validAmount
        ? "Enter an amount"
        : insufficient
          ? `Not enough ${from?.symbol}`
          : swapping
            ? "Confirm in wallet…"
            : quoteError && quoteFresh
              ? "No route right now"
              : `${mode === "buy" ? "Buy" : "Sell"} ${token.symbol}`
  const disabled = !!account && (!token || !validAmount || insufficient || swapping || (!!quoteError && quoteFresh))
  const accent = mode === "buy" ? "#d6ff2b" : "#ff2d95"

  return (
    <div className="rounded-2xl border border-[#22e4ff]/25 bg-[#130a1f]/90 p-4 backdrop-blur sm:p-5" id="swap-box">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#0d0818] p-1" role="tablist" aria-label="Trade direction">
          {(["buy", "sell"] as const).map((m) => {
            const selected = mode === m
            const c = m === "buy" ? "#d6ff2b" : "#ff2d95"
            return (
              <button
                key={m}
                role="tab"
                aria-selected={selected}
                onClick={() => onModeChange(m)}
                className="rounded-lg py-2 font-display text-sm font-black uppercase tracking-wider transition"
                style={{ backgroundColor: selected ? c : "transparent", color: selected ? "#0a0510" : "#cbd5e1" }}
              >
                {m}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
          aria-label="Slippage settings"
          className={`rounded-lg border p-2.5 transition ${showSettings ? "border-[#22e4ff]/60 text-[#22e4ff]" : "border-white/10 text-slate-300 hover:text-white"}`}
        >
          <Settings2 size={16} />
        </button>
      </div>

      {showSettings && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#0d0818] px-3 py-2.5">
          <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-300">Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_PRESETS.map((s) => (
              <Chip key={s} selected={slippage === s} onClick={() => setSlippage(s)} color="#22e4ff">{s}%</Chip>
            ))}
          </div>
        </div>
      )}

      <AmountField
        label="You pay"
        token={from}
        balance={from ? fromBalance : null}
        account={account}
        balancesLoading={balancesLoading}
        onPick={mode === "sell" ? () => setPickerOpen(true) : undefined}
      >
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Amount of ${from?.symbol ?? "token"} to pay`}
          value={amount}
          placeholder="0"
          onChange={(e) => {
            const v = e.target.value.replace(",", ".")
            if (/^\d*\.?\d*$/.test(v)) { setAmount(v); setPercent(null) }
          }}
          className="w-full min-w-0 bg-transparent font-display text-3xl font-black tabular-nums text-white outline-none placeholder:text-slate-600"
        />
      </AmountField>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {mode === "buy"
          ? <>
              {BUY_PRESETS.map((v) => (
                <Chip key={v} selected={percent == null && amount === v} onClick={() => setPresetAmount(v)} color={accent}>{v} CRO</Chip>
              ))}
              {account && <Chip selected={percent === 100} onClick={() => setPresetPercent(100)} color={accent}>Max</Chip>}
            </>
          : SELL_PRESETS.map((p) => (
              <Chip key={p} selected={percent === p} onClick={() => setPresetPercent(p)} color={accent} disabled={!token || !account}>
                {p === 100 ? "Max" : `${p}%`}
              </Chip>
            ))}
      </div>

      <div className="relative z-10 -my-2.5 flex justify-center">
        <button
          onClick={() => onModeChange(mode === "buy" ? "sell" : "buy")}
          aria-label="Flip buy and sell"
          className="mt-3 rounded-xl border-4 border-[#130a1f] bg-[#22e4ff] p-2 text-[#06131a] transition hover:rotate-180 hover:bg-[#5cefff]"
        >
          <ArrowDownUp size={16} />
        </button>
      </div>

      <AmountField
        label="You receive"
        token={to}
        balance={to ? toBalance : null}
        account={account}
        balancesLoading={balancesLoading}
        onPick={mode === "buy" ? () => setPickerOpen(true) : undefined}
      >
        <div className="flex min-w-0 items-center gap-2 font-display text-3xl font-black tabular-nums" aria-live="polite">
          {!token || !validAmount ? (
            <span className="text-slate-600">0</span>
          ) : out != null ? (
            <span className="truncate text-white">{formatOut(out)}</span>
          ) : quoteError && quoteFresh ? (
            <span className="text-base text-[#ff2d95]">No route</span>
          ) : (
            <span className="h-8 w-28 animate-pulse rounded bg-white/10" aria-label="Fetching price" />
          )}
          {quoteLoading && out != null && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" aria-hidden="true" />}
        </div>
      </AmountField>

      {token && out != null && rate != null && (
        <dl className="mt-3 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-[#0d0818] px-3 py-2.5 text-[13px]">
          <Row label="Rate">1 {from?.symbol} = {formatOut(rate)} {to?.symbol}</Row>
          <Row label={`Min. received (${slippage}% slippage)`}>{formatOut(minOut ?? 0)} {to?.symbol}</Row>

          {quote && quote.route.length > 0 && <Row label="Route">{quote.route.slice(0, 3).join(" + ")}</Row>}
        </dl>
      )}

      <button
        onClick={submit}
        disabled={disabled}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-4 font-display text-base font-black uppercase tracking-wider text-[#0a0510] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: account ? accent : "#22e4ff" }}
      >
        {swapping && <Loader2 size={16} className="animate-spin" />}
        {label}
      </button>
      {from?.isNative && account && (
        <p className="mt-2 text-center text-xs text-slate-400">Keeps {CRO_GAS_RESERVE} CRO in your wallet for gas.</p>
      )}

      {pickerOpen && (
        <TokenPickerDialog
          tokens={tokens}
          balances={balances}
          onClose={() => setPickerOpen(false)}
          onSelect={(t) => { onTokenChange(t); setPickerOpen(false) }}
        />
      )}
    </div>
  )
}

function AmountField({ label, token, balance, account, balancesLoading, onPick, children }: {
  label: string
  token: Token | null
  balance: number | null
  account: string | null
  balancesLoading: boolean
  onPick?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0818] p-4 transition focus-within:border-[#22e4ff]/50">
      <div className="mb-2 flex items-center justify-between font-display text-xs uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span>
          Balance{" "}
          <span className="text-slate-300">
            {!account || balance == null ? "—" : balancesLoading && balance === 0 ? "…" : formatBalance(balance)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <TokenButton token={token} onClick={onPick} />
      </div>
    </div>
  )
}

function TokenButton({ token, onClick }: { token: Token | null; onClick?: () => void }) {
  const content = token ? (
    <>
      <TokenLogo token={token} />
      <span className="font-display text-sm font-black">{token.symbol}</span>
    </>
  ) : (
    <span className="font-display text-sm font-black">Select token</span>
  )
  if (!onClick) {
    return <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/5 py-1.5 pl-1.5 pr-3">{content}</div>
  }
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-2.5 transition ${token ? "bg-white/10 pl-1.5 hover:bg-white/15" : "bg-[#22e4ff] pl-3 text-[#06131a] hover:bg-[#5cefff]"}`}
      aria-label={token ? `Change token, currently ${token.symbol}` : "Select token"}
    >
      {content}
      <ChevronDown size={16} aria-hidden="true" />
    </button>
  )
}

function TokenLogo({ token, size = 28 }: { token: Token; size?: number }) {
  const [failed, setFailed] = useState(false)
  const src = getTokenLogoUrl(token)
  useEffect(() => setFailed(false), [src])
  if (src && !failed) {
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-white/5 object-cover" style={{ width: size, height: size }} onError={() => setFailed(true)} />
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-[11px] font-black" style={{ width: size, height: size }}>
      {token.symbol.slice(0, 2)}
    </span>
  )
}

function TokenPickerDialog({ tokens, balances, onClose, onSelect }: { tokens: Token[]; balances: BalanceMap; onClose: () => void; onSelect: (t: Token) => void }) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = tokens.filter((t) => !t.isNative)
    const matched = q ? pool.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q) : pool
    const held = (t: Token) => Number(balances[t.address.toLowerCase()] ?? 0)
    return [...matched].sort((a, b) => Number(isMery(b.address)) - Number(isMery(a.address)) || Number(held(b) > 0) - Number(held(a) > 0)).slice(0, 80)
  }, [tokens, balances, query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 pt-20 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Select a token">
      <div className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#22e4ff]/30 bg-[#0d0818]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="font-display text-lg font-black uppercase">Select a token</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-300 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-3">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 focus-within:border-[#22e4ff]/60">
            <Search size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Search tokens</span>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or paste address"
              className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
        <ul className="overflow-y-auto px-2 pb-2">
          {list.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-400">No tokens found.</li>
          ) : list.map((t) => {
            const bal = Number(balances[t.address.toLowerCase()] ?? 0)
            return (
              <li key={t.address}>
                <button onClick={() => onSelect(t)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-white/5">
                  <TokenLogo token={t} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm font-black">{t.symbol}</span>
                    <span className="block truncate text-xs text-slate-400">{t.name}</span>
                  </span>
                  {bal > 0 && <span className="shrink-0 font-display text-xs tabular-nums text-slate-300">{formatBalance(bal)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function Chip({ selected, onClick, color, disabled, children }: { selected: boolean; onClick: () => void; color: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className="rounded-md border px-2.5 py-1.5 font-display text-xs font-black uppercase tabular-nums transition disabled:opacity-40"
      style={{ borderColor: selected ? color : "rgba(255,255,255,0.1)", backgroundColor: selected ? `${color}1f` : "transparent", color: selected ? color : "#94a3b8" }}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="truncate text-right font-display font-bold tabular-nums text-slate-200">{children}</dd>
    </div>
  )
}
