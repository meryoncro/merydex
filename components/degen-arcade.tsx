"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Crown, Flame, Gamepad2, LineChart, Loader2, Radio, RefreshCw, Rocket, Search, Star, TrendingDown, TrendingUp, User, X } from "lucide-react"
import type { Token } from "@/lib/tokens"
import { isMery } from "@/lib/score"
import { Leaderboard, TradeFeed, TradeTicker, TraderProfile, fetchJson, formatUsd, socialAction, timeAgo, type FeedTrade } from "@/components/arcade-social"

type Timeframe = "m5" | "h1" | "h6" | "h24"
type SortMode = "hot" | "gainers" | "new" | "watchlist"
type Section = "market" | "feed" | "leaders" | "profile"

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "m5", label: "5M" },
  { id: "h1", label: "1H" },
  { id: "h6", label: "6H" },
  { id: "h24", label: "24H" },
]
const SORTS: { id: SortMode; label: string; short?: string; icon: typeof Flame }[] = [
  { id: "hot", label: "Hot", icon: Flame },
  { id: "gainers", label: "Gainers", short: "Top", icon: TrendingUp },
  { id: "new", label: "New", icon: Rocket },
  { id: "watchlist", label: "Watchlist", short: "Saved", icon: Star },
]
const SECTIONS: { id: Section; label: string; icon: typeof Flame }[] = [
  { id: "market", label: "Market", icon: LineChart },
  { id: "feed", label: "Live feed", icon: Radio },
  { id: "leaders", label: "Leaders", icon: Crown },
  { id: "profile", label: "Profile", icon: User },
]

interface TokenFrame { change: number | null; volume: number; buys: number; sells: number }

type PlayerId = "cat" | "dog" | "degen"

interface ArcadeToken {
  address: string
  symbol: string
  name: string
  priceUsd: number | null
  change24h: number | null
  liquidityUsd: number | null
  swaps24h: number
  buys24h: number
  sells24h: number
  imageUrl: string | null
  volume24h?: number
  marketCap?: number | null
  pairCreatedAt?: number | null
  frames?: Record<Timeframe, TokenFrame>
}

const frameOf = (row: ArcadeToken, tf: Timeframe): TokenFrame =>
  row.frames?.[tf] ?? { change: row.change24h, volume: row.volume24h ?? 0, buys: row.buys24h, sells: row.sells24h }

interface DegenScore {
  me: { score: number; trades: number; rank: number | null } | null
  top: { wallet: string; trades: number; score: number }[]
}

const PLAYERS: { id: PlayerId; name: string; tagline: string; accent: string; glow: string }[] = [
  { id: "cat", name: "Cat Lover", tagline: "Nine lives, zero regrets. Stacks every cat coin on the chain.", accent: "#29e6ff", glow: "neon-cyan" },
  { id: "dog", name: "Dog Lover", tagline: "Loyal to the pack. Holds the dogs through every dip.", accent: "#3dff9a", glow: "neon-lime" },
  { id: "degen", name: "Degen", tagline: "Zero or hero. Full send on whatever moves next.", accent: "#ff3d7f", glow: "neon-pink" },
]

const PLAYER_STORAGE_KEY = "merydex:arcade-player"
const isPlayerId = (v: unknown): v is PlayerId => v === "cat" || v === "dog" || v === "degen"

const SWIPE_THRESHOLD_PX = 60

const formatPrice = (p: number | null) => {
  if (p == null) return "—"
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (p >= 0.0001) return `$${p.toPrecision(3)}`
  return `$${p.toExponential(2)}`
}

const shortWallet = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`

interface DegenArcadeProps {
  tokens: Token[]
  account: string | null
  swapping: boolean
  selectedAddress: string | null
  onPick: (token: Token, mode: "buy" | "sell") => void
  onConnect: () => void
}

export function DegenArcade({ tokens, account, swapping, selectedAddress, onPick, onConnect }: DegenArcadeProps) {
  const handleBuy = (token: Token) => onPick(token, "buy")
  const handleSell = (token: Token) => onPick(token, "sell")
  const [player, setPlayerState] = useState<PlayerId>("cat")
  const [allRows, setAllRows] = useState<ArcadeToken[] | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const saved = window.localStorage.getItem(PLAYER_STORAGE_KEY)
    if (isPlayerId(saved)) setPlayerState(saved)
  }, [])

  const setPlayer = (id: PlayerId) => {
    setPlayerState(id)
    window.localStorage.setItem(PLAYER_STORAGE_KEY, id)
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)
  const [score, setScore] = useState<DegenScore | null>(null)
  const [section, setSection] = useState<Section>("market")
  const [sort, setSort] = useState<SortMode>("hot")
  const [timeframe, setTimeframe] = useState<Timeframe>("h24")
  const [profileTarget, setProfileTarget] = useState<string | null>(null)
  const [watchError, setWatchError] = useState<string | null>(null)
  const me = account?.toLowerCase() ?? null

  const { data: feed } = useSWR<{ trades: FeedTrade[] }>("/api/social?view=feed", fetchJson, { refreshInterval: 5000 })
  const { data: watch, mutate: mutateWatch } = useSWR<{ tokens: string[] }>(me ? `/api/social?view=watchlist&wallet=${me}` : null, fetchJson)
  const watched = useMemo(() => new Set(watch?.tokens ?? []), [watch])

  const toggleWatch = async (address: string) => {
    if (!account) return onConnect()
    const a = address.toLowerCase()
    const was = watched.has(a)
    setWatchError(null)
    mutateWatch({ tokens: was ? [...watched].filter((t) => t !== a) : [a, ...watched] }, false)
    try {
      await socialAction(account, was ? "unwatch" : "watch", a)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Watchlist update failed"
      setWatchError(/rejected|denied|4001/i.test(msg) ? "Signature cancelled." : msg)
    } finally {
      mutateWatch()
    }
  }

  const openTrader = (wallet: string) => {
    setProfileTarget(wallet.toLowerCase())
    setSection("profile")
  }

  const tokenByAddress = useMemo(() => {
    const map = new Map<string, Token>()
    for (const t of tokens) if (!t.isNative) map.set(t.address.toLowerCase(), t)
    return map
  }, [tokens])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    fetch("/api/arcade", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("arcade failed"))))
      .then((d) => setAllRows(d.tokens ?? []))
      .catch((e) => { if (e?.name !== "AbortError") setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (swapping) return
    const controller = new AbortController()
    // Trades are recorded fire-and-forget after a swap confirms, so give the
    // write a moment to land before re-reading the score.
    const timer = setTimeout(() => {
      const qs = account ? `?wallet=${account}` : ""
      fetch(`/api/degenscore${qs}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setScore(d) })
        .catch(() => {})
    }, 1500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [account, swapping])

  const active = PLAYERS.find((p) => p.id === player) ?? PLAYERS[0]
  const ranked = useMemo(() => {
    const list = [...(allRows ?? [])]
    const txns = (r: ArcadeToken) => { const f = frameOf(r, timeframe); return f.buys + f.sells }
    const hot = (a: ArcadeToken, b: ArcadeToken) => txns(b) - txns(a) || frameOf(b, timeframe).volume - frameOf(a, timeframe).volume
    if (sort === "gainers") {
      return list
        .filter((r) => frameOf(r, timeframe).change != null && txns(r) > 0)
        .sort((a, b) => (frameOf(b, timeframe).change ?? 0) - (frameOf(a, timeframe).change ?? 0))
    }
    if (sort === "new") return list.filter((r) => r.pairCreatedAt).sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0))
    if (sort === "watchlist") return list.filter((r) => watched.has(r.address.toLowerCase())).sort(hot)
    return list.sort(hot)
  }, [allRows, sort, timeframe, watched])
  // $MERY is the house token: always pinned to the top of every sort (except a
  // watchlist it isn't on).
  const sorted = useMemo(() => {
    const mery = (allRows ?? []).find((r) => isMery(r.address))
    if (!mery || (sort === "watchlist" && !watched.has(mery.address.toLowerCase()))) return ranked
    return [mery, ...ranked.filter((r) => !isMery(r.address))]
  }, [ranked, allRows, sort, watched])
  const rankByAddress = useMemo(() => new Map(sorted.map((r, i) => [r.address.toLowerCase(), i + 1])), [sorted])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.address.toLowerCase() === q)
  }, [sorted, query])
  const tfLabel = TIMEFRAMES.find((t) => t.id === timeframe)?.label ?? "24H"

  return (
    <div className="arcade-panel rounded-2xl border border-white/15 bg-[#171230]/70 p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-display text-xs font-bold tracking-normal text-[#ff3d7f]">
            <Gamepad2 size={15} /> Degen Arcade
          </div>
          <h2 className="mt-1 text-balance font-display text-xl font-bold leading-tight tracking-tight sm:text-2xl">Pick your player</h2>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-xs tracking-normal text-slate-400">DegenScore</div>
          <div className="font-display text-xl font-bold tabular-nums text-[#3dff9a] sm:text-2xl">
            {account ? (score?.me?.score ?? 0).toLocaleString() : "—"}
          </div>
          <div className="font-display text-xs tracking-normal text-slate-400">
            {!account ? "Connect to play" : score?.me?.rank ? `Rank #${score.me.rank}` : "Unranked"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Choose your player profile">
        {PLAYERS.map((p) => {
          const selected = p.id === player
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={selected}
              onClick={() => setPlayer(p.id)}
              className="min-w-0 rounded-lg border px-2.5 py-2.5 text-left transition sm:px-3 sm:py-3"
              style={{
                borderColor: selected ? p.accent : "rgba(255,255,255,0.1)",
                backgroundColor: selected ? `${p.accent}14` : "transparent",
              }}
            >
              <div className={`font-display text-xs font-bold leading-tight sm:text-sm ${selected ? p.glow : ""}`} style={{ color: selected ? p.accent : "#cbd5e1" }}>
                {p.name}
              </div>
              <div className="mt-0.5 truncate font-display text-[11px] tracking-normal text-slate-400">
                {selected ? "Playing" : "Select"}
              </div>
            </button>
          )
        })}
      </div>

      {feed && feed.trades.length > 0 && <div className="mt-4"><TradeTicker trades={feed.trades} /></div>}

      <div className="mt-4 grid grid-cols-4 gap-1 arcade-panel rounded-xl border border-white/15 bg-[#110d22] p-1" role="tablist" aria-label="Arcade sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const selected = section === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={selected}
              onClick={() => { setSection(id); if (id === "profile") setProfileTarget(null) }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 font-display text-[11px] font-bold tracking-normal transition sm:flex-row sm:gap-1.5 sm:px-2 sm:text-[13px] ${
                selected ? "bg-[#ff3d7f] text-[#0b0816]" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {section === "market" ? (<>
      <p className="mt-4 text-pretty text-xs leading-5 text-slate-300">{active.tagline}</p>

      <div className="mt-3 flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-[#29e6ff]/60">
          <Search size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="sr-only">Search tokens</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search token, name, or address"
            className="w-full min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="shrink-0 text-slate-400 hover:text-white" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
        <button
          onClick={() => setReload((n) => n + 1)}
          disabled={loading}
          className="shrink-0 rounded-md p-2 text-slate-300 hover:bg-white/5 hover:text-[#29e6ff] disabled:opacity-40"
          aria-label="Refresh token list"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto" role="tablist" aria-label="Sort tokens">
          {SORTS.map(({ id, label, short, icon: Icon }) => {
            const selected = sort === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={selected}
                onClick={() => setSort(id)}
                className={`flex min-w-0 items-center justify-center gap-1 rounded-md border px-1.5 py-2 font-display text-xs font-bold tracking-normal transition sm:shrink-0 sm:px-2.5 sm:py-1.5 ${
                  selected ? "border-[#29e6ff]/60 bg-[#29e6ff]/10 text-[#29e6ff]" : "border-white/10 text-slate-300 hover:text-white"
                }`}
              >
                <Icon size={12} aria-hidden="true" className={`hidden shrink-0 min-[400px]:block ${id === "hot" && selected ? "text-[#ff3d7f]" : ""}`} />
                <span className="sm:hidden">{short ?? label}</span>
                <span className="hidden sm:inline">{label}</span>
                {id === "watchlist" && watched.size > 0 && <span className="tabular-nums text-slate-400">{watched.size}</span>}
              </button>
            )
          })}
        </div>
        {sort !== "new" ? (
          <div className="flex rounded-md border border-white/10 p-0.5" role="radiogroup" aria-label="Timeframe">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={timeframe === t.id}
                onClick={() => setTimeframe(t.id)}
                className={`rounded px-2 py-1 font-display text-xs font-bold tabular-nums transition ${timeframe === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {watchError && <p className="mt-2 text-[13px] text-[#ff3d7f]" role="alert">{watchError}</p>}

      <div className="mt-3 flex items-center justify-between border-b border-white/10 pb-2 font-display text-xs tracking-normal text-slate-400">
        <span>
          {allRows ? `${rows.length}${query ? ` of ${sorted.length}` : ""} tokens` : "Tokens"} ·{" "}
          {sort === "gainers" ? `${tfLabel} change` : sort === "new" ? "newest pairs" : `${tfLabel} txns`}
        </span>
        <span>Tap Buy or Sell to load the swap box</span>
      </div>

      <div className="max-h-[65vh] overflow-y-auto overscroll-contain sm:max-h-[520px]">
        {loading && !allRows ? (
          <div className="flex flex-col gap-3 py-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
                <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
                <div className="ml-auto h-7 w-28 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="py-10 text-center text-sm text-slate-400">Couldn&apos;t load markets. Try refreshing.</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400 text-pretty">
            {query
              ? `No tokens match "${query}".`
              : sort === "watchlist"
                ? account ? "Your watchlist is empty. Tap the star on any token to track it." : "Connect your wallet to build a watchlist."
                : "No active tokens right now."}
          </p>
        ) : (
          <ol>
            {rows.map((row) => (
              <ArcadeRow
                key={row.address}
                rank={rankByAddress.get(row.address.toLowerCase()) ?? 0}
                row={row}
                accent={active.accent}
                token={tokenByAddress.get(row.address.toLowerCase())}
                buyLabel="Buy"
                sellLabel="Sell"
                busy={swapping}
                pending={null}
                selected={selectedAddress === row.address.toLowerCase()}
                buyDisabled={false}
                onBuy={handleBuy}
                onSell={handleSell}
                timeframe={timeframe}
                tfLabel={tfLabel}
                watched={watched.has(row.address.toLowerCase())}
                onToggleWatch={toggleWatch}
              />
            ))}
          </ol>
        )}
      </div>

      </>) : (
        <div className="mt-4">
          {section === "feed" ? (
            <TradeFeed account={account} trades={feed?.trades} onOpenTrader={openTrader} />
          ) : section === "leaders" ? (
            <Leaderboard account={account} onConnect={onConnect} onOpenTrader={openTrader} />
          ) : (
            <TraderProfile
              account={account}
              target={profileTarget}
              onConnect={onConnect}
              onBack={profileTarget && profileTarget !== me ? () => setProfileTarget(null) : undefined}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function ScoreBoost() {
  return (
    <span
      className="shrink-0 rounded border border-[#29e6ff]/50 bg-[#29e6ff]/15 px-1.5 py-0.5 font-display text-[10px] font-bold leading-none tracking-normal text-[#29e6ff]"
      title="Trades in $MERY earn 2x DegenScore"
    >
      2x score
    </span>
  )
}

interface ArcadeRowProps {
  rank: number
  row: ArcadeToken
  accent: string
  token: Token | undefined
  buyLabel: string
  sellLabel: string
  busy: boolean
  pending: "buy" | "sell" | null
  selected: boolean
  buyDisabled: boolean
  onBuy: (token: Token) => void
  onSell: (token: Token) => void
  timeframe: Timeframe
  tfLabel: string
  watched: boolean
  onToggleWatch: (address: string) => void
}

const NEW_PAIR_MS = 24 * 60 * 60 * 1000

function ArcadeRow({ rank, row, accent, token, buyLabel, sellLabel, busy, pending, selected, buyDisabled, onBuy, onSell, timeframe, tfLabel, watched, onToggleWatch }: ArcadeRowProps) {
  const startX = useRef<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const [logoFailed, setLogoFailed] = useState(false)
  const tradable = token != null && !busy
  const frame = frameOf(row, timeframe)
  const up = (frame.change ?? 0) >= 0
  const logo = token?.logoURI || row.imageUrl
  const txns = frame.buys + frame.sells
  const buyShare = txns > 0 ? Math.round((frame.buys / txns) * 100) : 50
  const isNew = row.pairCreatedAt != null && Date.now() - row.pairCreatedAt < NEW_PAIR_MS

  const endSwipe = () => {
    if (token && dragX > SWIPE_THRESHOLD_PX) onBuy(token)
    else if (token && dragX < -SWIPE_THRESHOLD_PX) onSell(token)
    startX.current = null
    setDragX(0)
  }

  const swipeHint = dragX > SWIPE_THRESHOLD_PX ? "rgba(214,255,43,0.12)" : dragX < -SWIPE_THRESHOLD_PX ? "rgba(255,45,149,0.12)" : "transparent"

  return (
    <li className="border-b border-white/[0.06] last:border-0" style={{ backgroundColor: selected && swipeHint === "transparent" ? "rgba(34,228,255,0.06)" : swipeHint }}>
      <div
        className="flex touch-pan-y select-none flex-wrap items-center gap-x-2.5 gap-y-2 py-3 transition-transform sm:flex-nowrap sm:gap-3"
        style={{ transform: `translateX(${Math.max(-80, Math.min(80, dragX))}px)` }}
        onPointerDown={(e) => { if (tradable && e.pointerType !== "mouse") startX.current = e.clientX }}
        onPointerMove={(e) => { if (startX.current != null) setDragX(e.clientX - startX.current) }}
        onPointerUp={endSwipe}
        onPointerCancel={() => { startX.current = null; setDragX(0) }}
      >
        <span className="w-5 shrink-0 text-center font-display text-xs font-bold tabular-nums" style={{ color: rank <= 3 ? accent : "#64748b" }}>
          {rank}
        </span>
        {logo && !logoFailed ? (
          <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/5 object-cover" onError={() => setLogoFailed(true)} />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-xs font-bold text-white">
            {row.symbol.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-sm font-bold text-white">{row.symbol}</span>
            {isMery(row.address) && <ScoreBoost />}
            <span
              className={`flex items-center gap-0.5 font-display text-xs font-bold tabular-nums ${up ? "text-[#3dff9a]" : "text-[#ff3d7f]"}`}
              title={`${tfLabel} change`}
            >
              {up ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />}
              {frame.change == null ? "—" : `${up ? "+" : ""}${frame.change.toFixed(1)}%`}
            </span>
            {isNew && (
              <span className="rounded bg-[#29e6ff]/15 px-1 py-px font-display text-[11px] font-bold tracking-normal text-[#29e6ff]">
                New {row.pairCreatedAt ? timeAgo(new Date(row.pairCreatedAt).toISOString()) : ""}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-x-2 overflow-hidden whitespace-nowrap text-[13px] text-slate-400 sm:flex-wrap">
            <span className="text-slate-300">{formatPrice(row.priceUsd)}</span>
            <span className="tabular-nums" title={`${tfLabel} transactions`}>{txns.toLocaleString()}<span className="sm:hidden"> tx</span><span className="hidden sm:inline"> txns</span></span>
            <span className="tabular-nums" title="Liquidity">Liq {formatUsd(row.liquidityUsd)}</span>
            <span className="hidden tabular-nums md:inline" title={`${tfLabel} volume`}>Vol {formatUsd(frame.volume)}</span>
            {row.marketCap != null && <span className="hidden tabular-nums md:inline" title="Market cap">MC {formatUsd(row.marketCap)}</span>}
          </div>
          <div className="mt-1.5 hidden h-1 w-full max-w-40 overflow-hidden rounded-full bg-[#ff3d7f]/40 sm:block" role="img" aria-label={`${buyShare}% buys in ${tfLabel}`}>
            <div className="h-full rounded-full bg-[#3dff9a]" style={{ width: `${buyShare}%` }} />
          </div>
        </div>
        <button
          onClick={() => onToggleWatch(row.address)}
          aria-pressed={watched}
          aria-label={watched ? `Remove ${row.symbol} from watchlist` : `Add ${row.symbol} to watchlist`}
          className={`shrink-0 rounded-md p-2 transition hover:bg-white/5 sm:p-1.5 ${watched ? "text-[#3dff9a]" : "text-slate-400 hover:text-slate-300"}`}
        >
          <Star size={16} fill={watched ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:shrink-0">
          <button
            onClick={() => token && onBuy(token)}
            disabled={!tradable || buyDisabled}
            className="flex min-w-[76px] items-center justify-center gap-1 rounded-md bg-[#3dff9a] px-3 py-2.5 sm:py-1.5 font-display text-[13px] font-bold tracking-normal text-[#0b0816] transition hover:bg-[#8cffc0] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`${buyLabel} CRO of ${row.symbol}`}
          >
            {pending === "buy" ? <Loader2 size={13} className="animate-spin" /> : buyLabel}
          </button>
          <button
            onClick={() => token && onSell(token)}
            disabled={!tradable}
            className="flex min-w-[76px] items-center justify-center gap-1 rounded-md border border-[#ff3d7f]/50 px-3 py-2.5 sm:py-1.5 font-display text-[13px] font-bold tracking-normal text-[#ff3d7f] transition hover:bg-[#ff3d7f]/10 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`${sellLabel} of ${row.symbol}`}
          >
            {pending === "sell" ? <Loader2 size={13} className="animate-spin" /> : sellLabel}
          </button>
        </div>
      </div>
    </li>
  )
}
