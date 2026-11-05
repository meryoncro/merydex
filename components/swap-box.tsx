"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { ArrowDown, ArrowRight, ChevronDown, Loader2, Search, Settings2, X } from "lucide-react"

function amountTextSize(text: string) {
  if (text.length <= 8) return "text-3xl"
  if (text.length <= 12) return "text-2xl"
  if (text.length <= 16) return "text-xl"
  return "text-lg"
}
import { getRoutingAddress, getTokenLogoUrl, type Token } from "@/lib/tokens"
import { isWrapPair } from "@/lib/swap"
import { formatBalance, type BalanceMap } from "@/lib/balances"
import { isMery } from "@/lib/score"

export type SwapMode = "buy" | "sell"
export type SwapSizing = { amount: string } | { percent: number }

const CRO_GAS_RESERVE = 0.5
const CRO_PRESETS = ["10", "50", "100", "500"]
const PERCENT_PRESETS = [25, 50, 75, 100]
const SLIPPAGE_PRESETS = ["0.5", "1", "3"]
const BASE_SYMBOLS = ["USDC"]

const sameToken = (a: Token, b: Token) => a.address.toLowerCase() === b.address.toLowerCase()

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
  const [amount, setAmount] = useState("50")
  const [percent, setPercent] = useState<number | null>(null)
  const [pickerSide, setPickerSide] = useState<"token" | "base" | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [debounced, setDebounced] = useState("50")
  const [base, setBase] = useState<Token>(cro)
  const keepAmountOnNextChange = useRef(true)

  const quickBases = useMemo(() => {
    const curated = tokens.filter((t) => !t.imported)
    return [cro, ...BASE_SYMBOLS.map((s) => curated.find((t) => t.symbol === s)).filter((t): t is Token => Boolean(t))]
  }, [tokens, cro])

  const from = mode === "buy" ? base : token
  const to = mode === "buy" ? token : base
  const fromBalance = from ? balanceOf(balances, from) : 0
  const toBalance = to ? balanceOf(balances, to) : 0

  // Only the pay-side token changing invalidates the typed amount; changing what you receive keeps it.
  useEffect(() => {
    if (keepAmountOnNextChange.current) {
      keepAmountOnNextChange.current = false
      return
    }
    setAmount(from?.isNative ? "50" : "")
    setPercent(null)
  }, [from?.address])

  const chooseBase = (t: Token) => {
    if (token && sameToken(t, token)) onTokenChange(base)
    setBase(t)
  }
  const chooseToken = (t: Token) => {
    if (sameToken(t, base)) setBase(token && !sameToken(token, t) ? token : sameToken(t, cro) ? quickBases[1] ?? cro : cro)
    onTokenChange(t)
  }

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
  const hasBalance = account != null && fromBalance > 0

  const setPresetAmount = (v: string) => { setAmount(v); setPercent(null) }
  const setPresetPercent = (p: number) => {
    if (!from) return
    setAmount(trimAmount((maxSpend * p) / 100, from.decimals))
    setPercent(p)
  }

  const flip = () => {
    if (to && out != null) {
      keepAmountOnNextChange.current = true
      setAmount(trimAmount(out, to.decimals))
      setPercent(null)
    }
    onModeChange(mode === "buy" ? "sell" : "buy")
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
              : `Swap ${from?.symbol} for ${to?.symbol}`
  const disabled = !!account && (!token || !validAmount || insufficient || swapping || (!!quoteError && quoteFresh))

  return (
    <div className="arcade-panel rounded-2xl border bg-[#171230]/95 p-3 backdrop-blur sm:p-4" id="swap-box">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h2 className="font-display text-lg font-bold text-white">Swap</h2>
        <button
          onClick={() => setShowSettings((s) => !s)}
          aria-expanded={showSettings}
          aria-label="Slippage settings"
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-display text-xs font-bold transition ${showSettings ? "bg-[#29e6ff]/15 text-[#29e6ff]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
        >
          {slippage}% slippage
          <Settings2 size={15} aria-hidden="true" />
        </button>
      </div>

      {showSettings && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-[#0d0a1c] px-3 py-2.5">
          <span className="font-display text-xs font-bold text-slate-300">Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_PRESETS.map((s) => (
              <Chip key={s} selected={slippage === s} onClick={() => setSlippage(s)}>{s}%</Chip>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row">
      <div className="min-w-0 md:flex-1">
      <AmountField
        label="You pay"
        token={from}
        balance={from ? fromBalance : null}
        account={account}
        balancesLoading={balancesLoading}
        onPick={() => setPickerSide(mode === "sell" ? "token" : "base")}
        onMax={hasBalance ? () => setPresetPercent(100) : undefined}
        footer={
          hasBalance
            ? PERCENT_PRESETS.map((p) => (
                <Chip key={p} selected={percent === p} onClick={() => setPresetPercent(p)}>{p === 100 ? "Max" : `${p}%`}</Chip>
              ))
            : from?.isNative
              ? CRO_PRESETS.map((v) => (
                  <Chip key={v} selected={percent == null && amount === v} onClick={() => setPresetAmount(v)}>{v}</Chip>
                ))
              : null
        }
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
          className={`h-11 w-full min-w-0 bg-transparent font-display font-bold tabular-nums text-white outline-none placeholder:text-slate-600 ${amountTextSize(amount)}`}
        />
      </AmountField>
      </div>

      <div className="relative z-10 -my-4 flex justify-center md:-mx-4 md:my-0 md:items-center">
        <button
          onClick={flip}
          aria-label="Switch pay and receive tokens"
          className="group rounded-xl border-4 border-[#171230] bg-[#221a44] p-2 text-[#29e6ff] transition hover:bg-[#29e6ff] hover:text-[#0b0816]"
        >
          <ArrowDown size={18} className="transition group-hover:rotate-180 md:hidden" aria-hidden="true" />
          <ArrowRight size={18} className="hidden transition group-hover:rotate-180 md:block" aria-hidden="true" />
        </button>
      </div>

      <div className="min-w-0 md:flex-1">
      <AmountField
        label="You receive"
        token={to}
        balance={to ? toBalance : null}
        account={account}
        balancesLoading={balancesLoading}
        onPick={() => setPickerSide(mode === "buy" ? "token" : "base")}
      >
        <div className={`flex h-11 min-w-0 items-center gap-2 font-display font-bold tabular-nums ${out != null && token && validAmount ? amountTextSize(formatOut(out)) : "text-3xl"}`} aria-live="polite">
          {!token || !validAmount ? (
            <span className="text-slate-600">0</span>
          ) : out != null ? (
            <span className="min-w-0 break-all leading-tight text-white" title={formatOut(out)}>{formatOut(out)}</span>
          ) : quoteError && quoteFresh ? (
            <span className="text-base text-[#ff3d7f]">No route for this pair</span>
          ) : (
            <span className="h-9 w-32 animate-pulse rounded-md bg-white/10" aria-label="Fetching price" />
          )}
          {quoteLoading && out != null && <Loader2 size={14} className="shrink-0 animate-spin text-slate-400" aria-hidden="true" />}
        </div>
      </AmountField>
      </div>
      </div>

      {token && out != null && rate != null && (
        <div className="mt-2 rounded-xl bg-[#0d0a1c]">
          <button
            onClick={() => setShowDetails((s) => !s)}
            aria-expanded={showDetails}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px]"
          >
            <span className="truncate font-display font-bold tabular-nums text-slate-200">1 {from?.symbol} = {formatOut(rate)} {to?.symbol}</span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
              {showDetails ? "Less" : "Details"}
              <ChevronDown size={14} className={`transition ${showDetails ? "rotate-180" : ""}`} aria-hidden="true" />
            </span>
          </button>
          {showDetails && (
            <dl className="flex flex-col gap-1.5 border-t border-white/5 px-3 pb-3 pt-2.5 text-[13px]">
              <Row label="Minimum received">{formatOut(minOut ?? 0)} {to?.symbol}</Row>
              <Row label="Max slippage">{slippage}%</Row>
              {quote && quote.route.length > 0 && <Row label="Route">{quote.route.slice(0, 3).join(" → ")}</Row>}
            </dl>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={disabled}
        className="arcade-btn mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#29e6ff] py-4 font-display text-base font-bold text-[#0b0816] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {swapping && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {label}
      </button>
      {from?.isNative && account && (
        <p className="mt-2 text-center text-xs text-slate-400">Keeps {CRO_GAS_RESERVE} CRO in your wallet for gas.</p>
      )}

      {pickerSide && (
        <TokenPickerDialog
          tokens={tokens}
          pinned={quickBases}
          balances={balances}
          onClose={() => setPickerSide(null)}
          onSelect={(t) => { if (pickerSide === "base") chooseBase(t); else chooseToken(t); setPickerSide(null) }}
        />
      )}
    </div>
  )
}

function AmountField({ label, token, balance, account, balancesLoading, onPick, onMax, footer, children }: {
  label: string
  token: Token | null
  balance: number | null
  account: string | null
  balancesLoading: boolean
  onPick?: () => void
  onMax?: () => void
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full rounded-xl border border-white/10 bg-[#0d0a1c] p-4 transition focus-within:border-[#29e6ff]/60">
      <div className="mb-1 font-display text-xs text-slate-400">{label}</div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <TokenButton token={token} onClick={onPick} />
      </div>
      {(footer || (account && token)) && <div className="mt-2 flex min-h-7 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">{footer}</div>
        {account && token && (
          <div className="ml-auto flex items-center gap-1.5 font-display text-xs text-slate-400">
            <span>
              Balance{" "}
              <span className="tabular-nums text-slate-300">
                {balance == null ? "—" : balancesLoading && balance === 0 ? "…" : formatBalance(balance)}
              </span>
            </span>
            {onMax && (
              <button onClick={onMax} className="rounded px-1 font-bold text-[#29e6ff] transition hover:bg-[#29e6ff]/10">
                Max
              </button>
            )}
          </div>
        )}
      </div>}
    </div>
  )
}

function TokenButton({ token, onClick }: { token: Token | null; onClick?: () => void }) {
  const content = token ? (
    <>
      <TokenLogo token={token} />
      <span className="font-display text-sm font-bold">{token.symbol}</span>
    </>
  ) : (
    <span className="font-display text-sm font-bold">Select token</span>
  )
  if (!onClick) {
    return <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/5 py-1.5 pl-1.5 pr-3">{content}</div>
  }
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-2.5 transition ${token ? "bg-white/10 pl-1.5 hover:bg-white/15" : "bg-[#29e6ff] pl-3 text-[#0b0816] hover:bg-[#8ef3ff]"}`}
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
    <span className="flex shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-[11px] font-bold" style={{ width: size, height: size }}>
      {token.symbol.slice(0, 2)}
    </span>
  )
}

function TokenPickerDialog({ tokens, pinned, balances, onClose, onSelect }: { tokens: Token[]; pinned: Token[]; balances: BalanceMap; onClose: () => void; onSelect: (t: Token) => void }) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q ? tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q) : tokens
    const held = (t: Token) => balanceOf(balances, t)
    return [...matched].sort((a, b) => Number(isMery(b.address)) - Number(isMery(a.address)) || Number(held(b) > 0) - Number(held(a) > 0)).slice(0, 80)
  }, [tokens, balances, query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 pt-20 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Select a token">
      <div className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#29e6ff]/30 bg-[#110d22]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="font-display text-lg font-bold">Select a token</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-300 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-3">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 focus-within:border-[#29e6ff]/60">
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
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pinned.map((t) => (
              <button key={t.address} onClick={() => onSelect(t)} className="flex items-center gap-1.5 rounded-full border border-white/15 py-1 pl-1 pr-3 font-display text-xs font-bold transition hover:border-[#29e6ff]/60 hover:text-[#29e6ff]">
                <TokenLogo token={t} size={20} />
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
        <ul className="overflow-y-auto px-2 pb-2">
          {list.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-400">No tokens found.</li>
          ) : list.map((t) => {
            const bal = balanceOf(balances, t)
            return (
              <li key={t.address}>
                <button onClick={() => onSelect(t)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-white/5">
                  <TokenLogo token={t} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm font-bold">{t.symbol}</span>
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

function Chip({ selected, onClick, disabled, children }: { selected: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-md px-2 py-1 font-display text-xs font-bold tabular-nums transition disabled:opacity-40 ${selected ? "bg-[#29e6ff]/15 text-[#29e6ff]" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}
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
