"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowLeftRight, Loader2, Search } from "lucide-react"

interface Ticker {
  instrument: string
  base: string
  quote: string
  last: number
  change: number
  high: number
  low: number
  volumeUsd: number
  bid: number
  ask: number
}
interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
interface Level { price: number; size: number }
interface View {
  ticker: Ticker | null
  candles: Candle[]
  book: { bids: Level[]; asks: Level[] }
  trades: { id: string; t: number; price: number; size: number; side: "buy" | "sell" }[]
}

const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1D"] as const
type Tf = (typeof TIMEFRAMES)[number]

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Market data unavailable")
  return res.json()
}

const fmtPrice = (n: number) => {
  if (!n) return "—"
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 8
  return n.toLocaleString("en-US", { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits })
}
const fmtCompact = (n: number) => n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
const fmtPct = (f: number) => `${f >= 0 ? "+" : ""}${(f * 100).toFixed(2)}%`

function CandleChart({ candles }: { candles: Candle[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 800
  const H = 320
  const VOL_H = 60
  const PAD_R = 64

  const geo = useMemo(() => {
    if (candles.length === 0) return null
    const hi = Math.max(...candles.map((c) => c.h))
    const lo = Math.min(...candles.map((c) => c.l))
    const range = hi - lo || hi * 0.01 || 1
    const maxV = Math.max(...candles.map((c) => c.v)) || 1
    const step = (W - PAD_R) / candles.length
    const priceH = H - VOL_H - 12
    const y = (p: number) => 8 + ((hi - p) / range) * priceH
    return { hi, lo, step, y, maxV, priceH }
  }, [candles])

  if (!geo) return <div className="flex h-72 items-center justify-center text-sm text-slate-400">No candles for this market.</div>

  const shown = hover !== null ? candles[hover] : candles[candles.length - 1]
  const last = candles[candles.length - 1]
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => geo.hi - f * (geo.hi - geo.lo))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-slate-400">
        <span>{new Date(shown.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span>O <span className="text-slate-200">{fmtPrice(shown.o)}</span></span>
        <span>H <span className="text-slate-200">{fmtPrice(shown.h)}</span></span>
        <span>L <span className="text-slate-200">{fmtPrice(shown.l)}</span></span>
        <span>C <span className={shown.c >= shown.o ? "text-[#d6ff2b]" : "text-[#ff2d95]"}>{fmtPrice(shown.c)}</span></span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-64 w-full touch-none sm:h-80"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Price chart, last close ${fmtPrice(last.c)}`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          const i = Math.floor(x / geo.step)
          setHover(i >= 0 && i < candles.length ? i : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((p) => (
          <g key={p}>
            <line x1={0} x2={W - PAD_R} y1={geo.y(p)} y2={geo.y(p)} stroke="rgba(255,255,255,0.06)" />
            <text x={W - PAD_R + 6} y={geo.y(p) + 4} fill="rgba(148,163,184,0.9)" fontSize="11" fontFamily="monospace">
              {fmtPrice(p)}
            </text>
          </g>
        ))}
        {candles.map((c, i) => {
          const up = c.c >= c.o
          const color = up ? "#d6ff2b" : "#ff2d95"
          const cx = i * geo.step + geo.step / 2
          const bw = Math.max(1, geo.step * 0.62)
          const top = geo.y(Math.max(c.o, c.c))
          const bodyH = Math.max(1, Math.abs(geo.y(c.o) - geo.y(c.c)))
          const vh = (c.v / geo.maxV) * (VOL_H - 6)
          return (
            <g key={c.t} opacity={hover === null || hover === i ? 1 : 0.55}>
              <line x1={cx} x2={cx} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={color} strokeWidth={1} />
              <rect x={cx - bw / 2} y={top} width={bw} height={bodyH} fill={color} />
              <rect x={cx - bw / 2} y={H - vh} width={bw} height={vh} fill={color} opacity={0.25} />
            </g>
          )
        })}
        <line x1={0} x2={W - PAD_R} y1={geo.y(last.c)} y2={geo.y(last.c)} stroke="#22e4ff" strokeDasharray="4 4" strokeWidth={1} />
        <rect x={W - PAD_R + 2} y={geo.y(last.c) - 9} width={PAD_R - 4} height={18} rx={3} fill="#22e4ff" />
        <text x={W - PAD_R + 6} y={geo.y(last.c) + 4} fill="#06131a" fontSize="11" fontWeight="700" fontFamily="monospace">
          {fmtPrice(last.c)}
        </text>
        {hover !== null && (
          <line x1={hover * geo.step + geo.step / 2} x2={hover * geo.step + geo.step / 2} y1={0} y2={H} stroke="rgba(255,255,255,0.25)" />
        )}
      </svg>
    </div>
  )
}

function OrderBook({ book, last }: { book: View["book"]; last: number }) {
  const asks = book.asks.slice(0, 10).reverse()
  const bids = book.bids.slice(0, 10)
  const max = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size))
  const spread = book.asks[0] && book.bids[0] ? book.asks[0].price - book.bids[0].price : 0
  const row = (l: Level, side: "ask" | "bid") => (
    <li key={`${side}${l.price}`} className="relative flex justify-between px-3 py-1 font-mono text-xs tabular-nums">
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 right-0 ${side === "ask" ? "bg-[#ff2d95]/15" : "bg-[#d6ff2b]/10"}`}
        style={{ width: `${(l.size / max) * 100}%` }}
      />
      <span className={`relative ${side === "ask" ? "text-[#ff6fb5]" : "text-[#d6ff2b]"}`}>{fmtPrice(l.price)}</span>
      <span className="relative text-slate-300">{fmtCompact(l.size)}</span>
    </li>
  )
  return (
    <div className="flex flex-col">
      <div className="flex justify-between px-3 pb-2 font-display text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <span>Price</span>
        <span>Size</span>
      </div>
      <ul aria-label="Asks">{asks.map((l) => row(l, "ask"))}</ul>
      <div className="my-1 flex items-center justify-between border-y border-white/10 px-3 py-2">
        <span className="font-mono text-sm font-bold text-[#22e4ff]">{fmtPrice(last)}</span>
        <span className="font-mono text-[11px] text-slate-400">Spread {fmtPrice(spread)}</span>
      </div>
      <ul aria-label="Bids">{bids.map((l) => row(l, "bid"))}</ul>
    </div>
  )
}

export function ProTerminal({ croDexPrice, onSwap }: { croDexPrice: number | null; onSwap: () => void }) {
  const [instrument, setInstrument] = useState("CRO_USD")
  const [tf, setTf] = useState<Tf>("1h")
  const [query, setQuery] = useState("")

  const { data: tickerData } = useSWR<{ tickers: Ticker[] }>("/api/pro?view=tickers", fetcher, { refreshInterval: 15_000 })
  const { data: view, error, isLoading } = useSWR<View>(`/api/pro?instrument=${instrument}&tf=${tf}`, fetcher, {
    refreshInterval: 5_000,
    keepPreviousData: true,
  })

  const tickers = useMemo(() => {
    const list = tickerData?.tickers ?? []
    const q = query.trim().toUpperCase()
    return q ? list.filter((t) => t.base.includes(q)) : list
  }, [tickerData, query])

  const t = view?.ticker
  const isCro = instrument.startsWith("CRO_")
  const gap = isCro && t && croDexPrice ? (croDexPrice - t.last) / t.last : null

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[#ff2d95]">Pro terminal</span>
        <h1 className="font-display text-3xl font-black uppercase tracking-tight text-balance sm:text-4xl">
          CEX depth, <span className="text-[#22e4ff] neon-cyan">on-chain</span> execution
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300 text-pretty">
          Live order books, candles and trades from the Crypto.com Exchange, side by side with MCRO.FUN&apos;s on-chain Cronos price.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 sm:max-w-xs">
          <Search size={15} className="text-slate-400" aria-hidden="true" />
          <span className="sr-only">Filter markets</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter markets"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </label>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Markets">
          {tickers.length === 0 && <span className="px-2 py-2 text-xs text-slate-400">{tickerData ? "No markets match." : "Loading markets…"}</span>}
          {tickers.map((x) => (
            <button
              key={x.instrument}
              role="option"
              aria-selected={x.instrument === instrument}
              onClick={() => setInstrument(x.instrument)}
              className={`flex shrink-0 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition ${
                x.instrument === instrument ? "border-[#22e4ff]/60 bg-[#22e4ff]/10 glow-cyan" : "border-white/10 bg-black/20 hover:border-white/25"
              }`}
            >
              <span className="font-display text-xs font-black uppercase tracking-wider text-white">
                {x.base}
                <span className="text-slate-500">/{x.quote}</span>
              </span>
              <span className="flex gap-2 font-mono text-[11px] tabular-nums">
                <span className="text-slate-300">{fmtPrice(x.last)}</span>
                <span className={x.change >= 0 ? "text-[#d6ff2b]" : "text-[#ff2d95]"}>{fmtPct(x.change)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="font-display text-sm font-black uppercase tracking-wider text-slate-300">{instrument.replace("_", " / ")}</span>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl font-black tabular-nums text-white">{t ? fmtPrice(t.last) : "—"}</span>
                {t && <span className={`font-mono text-sm ${t.change >= 0 ? "text-[#d6ff2b]" : "text-[#ff2d95]"}`}>{fmtPct(t.change)}</span>}
                {isLoading && <Loader2 size={14} className="animate-spin text-slate-400" aria-label="Loading" />}
              </div>
            </div>
            <div className="flex gap-1 rounded-md border border-white/10 bg-black/30 p-1" role="group" aria-label="Timeframe">
              {TIMEFRAMES.map((x) => (
                <button
                  key={x}
                  onClick={() => setTf(x)}
                  aria-pressed={tf === x}
                  className={`rounded px-2.5 py-1 font-mono text-xs font-bold transition ${tf === x ? "bg-[#22e4ff] text-[#06131a]" : "text-slate-300 hover:text-white"}`}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          {t && (
            <dl className="grid grid-cols-2 gap-3 border-y border-white/5 py-3 sm:grid-cols-4">
              {[
                ["24h high", fmtPrice(t.high)],
                ["24h low", fmtPrice(t.low)],
                ["24h volume", `$${fmtCompact(t.volumeUsd)}`],
                ["Bid / ask", `${fmtPrice(t.bid)} / ${fmtPrice(t.ask)}`],
              ].map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-col gap-0.5">
                  <dt className="font-display text-[11px] font-bold uppercase tracking-wider text-slate-400">{k}</dt>
                  <dd className="truncate font-mono text-sm tabular-nums text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {error && !view ? (
            <p className="py-16 text-center text-sm text-[#ffb3d6]">Couldn&apos;t reach the exchange. Retrying shortly.</p>
          ) : view ? (
            <CandleChart candles={view.candles} />
          ) : (
            <div className="h-72 animate-pulse rounded-md bg-white/[0.04]" />
          )}
        </div>

        <div className="flex flex-col gap-5">
          {isCro && (
            <div className="flex flex-col gap-3 rounded-lg border border-[#d6ff2b]/30 bg-[#d6ff2b]/[0.05] p-4">
              <span className="font-display text-[11px] font-bold uppercase tracking-wider text-slate-300">CEX vs on-chain CRO</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-400">Crypto.com</span>
                  <span className="font-mono text-lg font-bold tabular-nums text-white">{t ? `$${fmtPrice(t.last)}` : "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-400">MCRO.FUN</span>
                  <span className="font-mono text-lg font-bold tabular-nums text-white">{croDexPrice ? `$${fmtPrice(croDexPrice)}` : "—"}</span>
                </div>
              </div>
              {gap !== null && (
                <p className="text-xs leading-relaxed text-slate-300">
                  On-chain is <span className={gap >= 0 ? "text-[#d6ff2b]" : "text-[#ff6fb5]"}>{fmtPct(gap)}</span> vs the exchange.
                </p>
              )}
              <button
                onClick={onSwap}
                className="flex items-center justify-center gap-2 rounded-md bg-[#d6ff2b] px-4 py-2.5 font-display text-xs font-black uppercase tracking-wider text-[#141a00] hover:bg-[#e2ff66]"
              >
                <ArrowLeftRight size={15} /> Swap CRO on-chain
              </button>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] py-3">
            <h2 className="px-3 pb-3 font-display text-sm font-black uppercase tracking-wider text-white">Order book</h2>
            {view ? <OrderBook book={view.book} last={t?.last ?? 0} /> : <div className="mx-3 h-80 animate-pulse rounded bg-white/[0.04]" />}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="pb-3 font-display text-sm font-black uppercase tracking-wider text-white">Recent trades</h2>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full font-mono text-xs tabular-nums">
            <thead className="sticky top-0 bg-[#130a1f] text-left font-display text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-2 font-bold">Time</th>
                <th className="py-2 text-right font-bold">Price</th>
                <th className="py-2 text-right font-bold">Size</th>
              </tr>
            </thead>
            <tbody>
              {(view?.trades ?? []).map((x) => (
                <tr key={x.id} className="border-t border-white/5">
                  <td className="py-1.5 text-slate-400">{new Date(x.t).toLocaleTimeString([], { hour12: false })}</td>
                  <td className={`py-1.5 text-right ${x.side === "buy" ? "text-[#d6ff2b]" : "text-[#ff6fb5]"}`}>{fmtPrice(x.price)}</td>
                  <td className="py-1.5 text-right text-slate-200">{fmtCompact(x.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">Market data from the Crypto.com Exchange public API. Swaps on MCRO.FUN settle on Cronos via WolfSwap.</p>
    </section>
  )
}
