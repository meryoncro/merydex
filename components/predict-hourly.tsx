"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Loader2, Timer, Wallet, X } from "lucide-react"
import { PICK_ERRORS, cents, fetcher, picksAction, pts, usd } from "@/lib/predict-client"

interface Level { price: number; size: number }
export interface HourlyMarket {
  symbol: string
  asset: string
  name: string
  strike: number
  expiresAt: number
  spot: number | null
  bids: Level[]
  asks: Level[]
  yesBuy: number | null
  noBuy: number | null
  yesSell: number | null
  noSell: number | null
  chance: number | null
}
type Side = "yes" | "no"

const HOURLY_KEY = "/api/predict/hourly"
const COLLAPSED = 6

function useHourly() {
  return useSWR<{ markets: HourlyMarket[]; serverTime: number }>(HOURLY_KEY, fetcher, { refreshInterval: 5_000 })
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function Distance({ m }: { m: HourlyMarket }) {
  if (!m.spot) return <span className="text-slate-500">Spot —</span>
  const diff = ((m.spot - m.strike) / m.strike) * 100
  const above = diff > 0
  return (
    <span className="flex items-center gap-1.5 font-mono tabular-nums">
      <span className="text-slate-300">{usd(m.spot)}</span>
      <span className={above ? "text-[#3dd68c]" : "text-[#f0616d]"}>
        {above ? "+" : ""}
        {diff.toFixed(2)}%
      </span>
    </span>
  )
}

function SideButton({ side, price, active, onClick }: { side: Side; price: number | null; active: boolean; onClick: () => void }) {
  const yes = side === "yes"
  return (
    <button
      onClick={onClick}
      disabled={price === null}
      aria-pressed={active}
      className={`flex-1 rounded-md py-2 font-display text-[11px] font-bold tracking-normal transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? yes
            ? "bg-[#3dd68c] text-[#0e0f12]"
            : "bg-[#f0616d] text-white"
          : yes
            ? "border border-[#3dd68c]/35 text-[#3dd68c] hover:bg-[#3dd68c]/10"
            : "border border-[#f0616d]/40 text-[#f0616d] hover:bg-[#f0616d]/10"
      }`}
    >
      {side} {price === null ? "—" : cents(price)}
    </button>
  )
}

export function HourlyBoard({ selected, onPick }: { selected: { symbol: string; side: Side } | null; onPick: (symbol: string, side: Side) => void }) {
  const { data, error, isLoading } = useHourly()
  const [expanded, setExpanded] = useState(false)
  const markets = data?.markets ?? []
  const now = useNow(markets.length > 0)
  const nextExpiry = markets.length ? Math.min(...markets.map((m) => m.expiresAt)) : null
  const shown = expanded ? markets : markets.slice(0, COLLAPSED)

  return (
    <section aria-labelledby="hourly-title" className="flex flex-col gap-4 rounded-lg border border-[#3dd68c]/25 bg-[#3dd68c]/[0.03] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold tracking-normal text-[#3dd68c]">Live order books</span>
          <h2 id="hourly-title" className="font-display text-xl font-bold tracking-tight text-white text-balance">
            Crypto rounds
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-slate-400 text-pretty">
            Will it close above the strike when the round ends? Fills at the real Crypto.com bid and ask.
          </p>
        </div>
        {nextExpiry && (
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2" aria-live="off">
            <Timer size={15} className="text-[#f2b33d]" aria-hidden="true" />
            <span className="font-display text-[11px] font-bold tracking-normal text-slate-400">Round ends</span>
            <span className="font-mono text-base font-bold tabular-nums text-white">{clock(nextExpiry - now)}</span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      )}
      {error && !markets.length && <p className="py-6 text-center text-sm text-[#f58a93]">Order books unavailable. Retrying shortly.</p>}
      {!isLoading && !error && !markets.length && <p className="py-6 text-center text-sm text-slate-400">Between rounds. The next one opens in a moment.</p>}

      {markets.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {shown.map((m) => {
            const active = selected?.symbol === m.symbol
            return (
              <li
                key={m.symbol}
                className={`flex min-w-0 flex-col gap-2.5 rounded-lg border p-3 transition ${active ? "border-[#f2b33d]/60 bg-[#f2b33d]/[0.06]" : "border-white/10 bg-black/25"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold tracking-wide text-white">{m.asset}</span>
                  <span className="font-display text-lg font-bold tabular-nums text-[#f2b33d]">{m.chance === null ? "—" : `${m.chance}%`}</span>
                </div>
                <div className="flex flex-col gap-0.5 text-xs">
                  <span className="truncate text-slate-400">
                    Above <span className="font-mono text-slate-100">{usd(m.strike)}</span>
                  </span>
                  <Distance m={m} />
                </div>
                <div className="flex gap-1.5">
                  <SideButton side="yes" price={m.yesBuy} active={active && selected?.side === "yes"} onClick={() => onPick(m.symbol, "yes")} />
                  <SideButton side="no" price={m.noBuy} active={active && selected?.side === "no"} onClick={() => onPick(m.symbol, "no")} />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {markets.length > COLLAPSED && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="self-center rounded-md border border-white/15 px-4 py-2 font-display text-[11px] font-bold tracking-normal text-slate-200 hover:border-white/40"
        >
          {expanded ? "Show fewer" : `Show all ${markets.length} rounds`}
        </button>
      )}
    </section>
  )
}

function BookLadder({ m }: { m: HourlyMarket }) {
  const asks = [...m.asks].reverse()
  const max = Math.max(1, ...m.asks.map((l) => l.size), ...m.bids.map((l) => l.size))
  const spread = m.asks[0] && m.bids[0] ? m.asks[0].price - m.bids[0].price : null
  const row = (l: Level, tone: "ask" | "bid") => (
    <li key={`${tone}-${l.price}`} className="relative flex justify-between px-2 py-1 font-mono text-xs tabular-nums">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 right-0 ${tone === "ask" ? "bg-[#f0616d]/15" : "bg-[#3dd68c]/12"}`}
        style={{ width: `${(l.size / max) * 100}%` }}
      />
      <span className={`relative ${tone === "ask" ? "text-[#f0616d]" : "text-[#3dd68c]"}`}>{cents(l.price)}</span>
      <span className="relative text-slate-300">{l.size.toLocaleString("en-US")}</span>
    </li>
  )

  return (
    <div className="flex flex-col gap-1 rounded-md border border-white/10 bg-black/30 py-1.5">
      <div className="flex justify-between px-2 font-display text-[10px] font-bold tracking-normal text-slate-500">
        <span>YES price</span>
        <span>Contracts</span>
      </div>
      {m.asks.length === 0 && m.bids.length === 0 ? (
        <p className="px-2 py-3 text-xs text-slate-400">Book is empty right now.</p>
      ) : (
        <>
          <ul aria-label="Asks">{asks.map((l) => row(l, "ask"))}</ul>
          <div className="border-y border-white/10 px-2 py-1 text-center font-display text-[10px] font-bold tracking-normal text-slate-400">
            Spread {spread === null ? "—" : cents(spread)}
          </div>
          <ul aria-label="Bids">{m.bids.map((l) => row(l, "bid"))}</ul>
        </>
      )}
    </div>
  )
}

export function HourlyTicket({
  symbol,
  side: initialSide,
  account,
  onConnect,
  balance,
  minStake,
  onPlaced,
  onClose,
}: {
  symbol: string
  side: Side
  account: string | null
  onConnect: () => void
  balance: number | null
  minStake: number
  onPlaced: () => void
  onClose: () => void
}) {
  const { data } = useHourly()
  const [side, setSide] = useState<Side>(initialSide)
  const [stake, setStake] = useState("100")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const m = data?.markets.find((x) => x.symbol === symbol)
  const now = useNow(!!m)

  useEffect(() => setSide(initialSide), [initialSide])

  const price = m ? (side === "yes" ? m.yesBuy : m.noBuy) : null
  const stakeN = Math.floor(Number(stake) || 0)
  const payout = price ? stakeN / price : 0
  const open = !!m && m.expiresAt - now > 60_000

  async function place() {
    if (!account || !m) return
    setBusy(true)
    setNotice(null)
    try {
      const r = await picksAction(account, { action: "open-hourly", symbol: m.symbol, side, stake: stakeN })
      setNotice(r.ok ? { tone: "ok", text: `${side.toUpperCase()} ${m.asset} above ${usd(m.strike)} for ${pts(stakeN)} pts.` } : { tone: "error", text: PICK_ERRORS[r.error] ?? "Something went wrong." })
      if (r.ok) onPlaced()
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message || "Signature was cancelled." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#f2b33d]/30 bg-[#111317] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[11px] font-bold tracking-normal text-[#3dd68c]">Crypto round</span>
          <h2 className="font-display text-lg font-bold leading-snug text-white text-pretty">
            {m ? `${m.name} above ${usd(m.strike)}?` : "Round ended"}
          </h2>
        </div>
        <button onClick={onClose} aria-label="Close ticket" className="rounded p-1 text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {!data && <Loader2 size={18} className="animate-spin text-slate-400" aria-label="Loading" />}
      {data && !m && <p className="text-sm text-slate-400">This round has closed and is settling. Pick a symbol from the next round.</p>}

      {m && (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <Distance m={m} />
            <span className="flex items-center gap-1.5 font-mono tabular-nums text-slate-300">
              <Timer size={13} className="text-[#f2b33d]" aria-hidden="true" />
              {clock(m.expiresAt - now)}
            </span>
          </div>

          <BookLadder m={m} />

          <div className="flex gap-2" role="group" aria-label="Side">
            <SideButton side="yes" price={m.yesBuy} active={side === "yes"} onClick={() => setSide("yes")} />
            <SideButton side="no" price={m.noBuy} active={side === "no"} onClick={() => setSide("no")} />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between font-display text-[11px] font-bold tracking-normal text-slate-400">
              Stake (points)
              {balance !== null && <span className="normal-case tracking-normal text-slate-500">Balance {pts(balance)}</span>}
            </span>
            <input
              inputMode="numeric"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              className="rounded-md border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-base text-white focus:border-[#f2b33d]/60 focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            {[50, 100, 250].map((v) => (
              <button key={v} onClick={() => setStake(String(v))} className="flex-1 rounded border border-white/10 py-1.5 font-mono text-xs text-slate-300 hover:border-white/30">
                {v}
              </button>
            ))}
            {balance !== null && (
              <button onClick={() => setStake(String(Math.floor(balance)))} className="flex-1 rounded border border-white/10 py-1.5 font-mono text-xs text-slate-300 hover:border-white/30">
                Max
              </button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Fills at the {side === "yes" ? "best ask" : "best bid"} ({price === null ? "—" : cents(price)}). Pays <span className="font-mono text-white">{pts(payout)}</span> pts if{" "}
            {m.asset} closes {side === "yes" ? "above" : "at or below"} {usd(m.strike)}. Close early at the live bid, or let it settle at expiry.
          </p>

          {account ? (
            <button
              onClick={place}
              disabled={busy || !open || price === null || stakeN < minStake || (balance !== null && stakeN > balance)}
              className="flex items-center justify-center gap-2 rounded-md arcade-btn bg-[#f2b33d] py-3 font-display text-xs font-bold tracking-normal text-[#0e0f12] hover:bg-[#f7c766] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {!open ? "Round closing" : price === null ? "No liquidity on this side" : "Place pick"}
            </button>
          ) : (
            <button onClick={onConnect} className="flex items-center justify-center gap-2 rounded-md arcade-btn bg-[#f2b33d] py-3 font-display text-xs font-bold tracking-normal text-[#0e0f12] hover:bg-[#f7c766]">
              <Wallet size={15} /> Connect to pick
            </button>
          )}
          {notice && (
            <p role="status" className={`text-sm ${notice.tone === "ok" ? "text-[#3dd68c]" : "text-[#f58a93]"}`}>
              {notice.text}
            </p>
          )}
        </>
      )}
    </div>
  )
}
