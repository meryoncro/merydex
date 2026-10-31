"use client"

import { useState } from "react"
import useSWR from "swr"
import { ArrowDownRight, ArrowUpRight, Crown, ExternalLink, Loader2, Radio, Repeat, UserCheck, UserPlus, X } from "lucide-react"
import { clearSession, ensureSession } from "@/lib/wallet-session"

export interface FeedTrade {
  id: number
  wallet: string
  txHash: string
  side: "buy" | "sell" | "swap"
  fromSymbol: string
  toSymbol: string
  token: string
  tokenAddress: string | null
  usd: number | null
  createdAt: string
}

interface Leader {
  wallet: string
  trades: number
  score: number
  volume: number
  followers: number
  following: boolean
  lastTrade: string
}

interface Profile {
  wallet: string
  trades: number
  score: number
  rank: number | null
  volume: number
  buys: number
  sells: number
  netFlow: number
  biggest: number
  firstTrade: string | null
  followers: number
  following: number
  isFollowing: boolean
  topTokens: { symbol: string; trades: number; volume: number }[]
  recent: FeedTrade[]
}

export const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error("request failed")
  return res.json()
}

export const shortWallet = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`
export const walletHue = (w: string) => parseInt(w.slice(2, 8), 16) % 360
export const formatUsd = (v: number | null | undefined, compact = true) => {
  if (v == null || !Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  const sign = v < 0 ? "-" : ""
  if (compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (compact && abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: abs < 10 ? 2 : 0 })}`
}
export const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** Signed social write; reuses the chat session and re-signs once if it expired. */
export async function socialAction(account: string, action: "follow" | "unfollow" | "watch" | "unwatch", target: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureSession(account)
    const res = await fetch("/api/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, target }),
    })
    if (res.status === 401 && attempt === 0) { clearSession(account); continue }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? "Action failed")
    return
  }
}

const friendlyError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : "Action failed"
  return /rejected|denied|4001/i.test(msg) ? "Signature cancelled." : msg
}

function Avatar({ wallet, size = 28 }: { wallet: string; size?: number }) {
  const hue = walletHue(wallet)
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-md"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 90% 60%), hsl(${(hue + 70) % 360} 90% 45%))`,
      }}
    />
  )
}

function SideBadge({ side }: { side: FeedTrade["side"] }) {
  if (side === "buy") return <span className="flex items-center gap-0.5 font-display text-xs font-bold text-[#3dd68c]"><ArrowUpRight size={12} />Bought</span>
  if (side === "sell") return <span className="flex items-center gap-0.5 font-display text-xs font-bold text-[#f0616d]"><ArrowDownRight size={12} />Sold</span>
  return <span className="flex items-center gap-0.5 font-display text-xs font-bold text-[#f2b33d]"><Repeat size={11} />Swapped</span>
}

function FollowButton({ account, target, following, onConnect, onChanged, compact }: {
  account: string | null; target: string; following: boolean; onConnect: () => void; onChanged: () => void; compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (account && account.toLowerCase() === target) return <span className="font-display text-xs tracking-normal text-slate-400">You</span>
  const toggle = async () => {
    if (!account) return onConnect()
    setBusy(true); setErr(null)
    try { await socialAction(account, following ? "unfollow" : "follow", target); onChanged() }
    catch (e) { setErr(friendlyError(e)) }
    finally { setBusy(false) }
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={`flex items-center gap-1 rounded-md border font-display font-bold tracking-normal transition disabled:opacity-50 ${compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-[13px]"} ${
          following ? "border-[#f2b33d]/50 bg-[#f2b33d]/10 text-[#f2b33d]" : "border-white/15 text-slate-300 hover:border-[#f2b33d]/60 hover:text-[#f2b33d]"
        }`}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : following ? <UserCheck size={12} /> : <UserPlus size={12} />}
        {following ? "Following" : "Follow"}
      </button>
      {err && <span className="text-xs text-[#f0616d]" role="alert">{err}</span>}
    </span>
  )
}

/* ---------- Live ticker (signature strip) ---------- */

export function TradeTicker({ trades }: { trades: FeedTrade[] }) {
  if (trades.length === 0) return null
  const loop = [...trades.slice(0, 14), ...trades.slice(0, 14)]
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#111317]" aria-label="Latest MCRO.FUN trades">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 bg-[#111317] pl-3 pr-2 font-display text-xs font-bold tracking-normal text-[#f0616d]">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f0616d] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#f0616d]" /></span>
        Live
      </div>
      <div className="animate-marquee flex w-max gap-6 py-2 pl-20 hover:[animation-play-state:paused]">
        {loop.map((t, i) => (
          <span key={`${t.id}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap text-[13px]" aria-hidden={i >= loop.length / 2}>
            <Avatar wallet={t.wallet} size={12} />
            <span className="font-mono text-slate-300">{shortWallet(t.wallet)}</span>
            <span className={t.side === "sell" ? "text-[#f0616d]" : t.side === "buy" ? "text-[#3dd68c]" : "text-[#f2b33d]"}>
              {t.side === "sell" ? "sold" : t.side === "buy" ? "aped" : "swapped"}
            </span>
            <span className="font-display font-bold text-white">{t.token}</span>
            <span className="tabular-nums text-slate-400">{formatUsd(t.usd)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- Feed ---------- */

export function TradeFeed({ account, trades, onOpenTrader }: { account: string | null; trades: FeedTrade[] | undefined; onOpenTrader: (w: string) => void }) {
  const [scope, setScope] = useState<"all" | "following">("all")
  const me = account?.toLowerCase()
  const { data: followingData } = useSWR<{ trades: FeedTrade[] }>(
    scope === "following" && me ? `/api/social?view=feed&scope=following&wallet=${me}` : null,
    fetchJson,
    { refreshInterval: 5000 },
  )
  const list = scope === "all" ? trades : followingData?.trades

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-display text-xs font-bold tracking-normal text-slate-300">
          <Radio size={13} className="text-[#f0616d]" /> What degens are buying
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Feed scope">
          {(["all", "following"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              onClick={() => setScope(s)}
              className={`rounded-md px-2.5 py-1 font-display text-xs font-bold tracking-normal transition ${scope === s ? "bg-[#f0616d]/15 text-[#f0616d]" : "text-slate-400 hover:text-white"}`}
            >
              {s === "all" ? "Everyone" : "Following"}
            </button>
          ))}
        </div>
      </div>

      {scope === "following" && !me ? (
        <Empty>Connect your wallet and follow traders to build your feed.</Empty>
      ) : !list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty>{scope === "following" ? "Nobody you follow has traded yet. Find legends in the Leaders tab." : "No trades yet. Be the first degen on the board."}</Empty>
      ) : (
        <ol className="max-h-[520px] overflow-y-auto">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 last:border-0">
              <button type="button" onClick={() => onOpenTrader(t.wallet)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open profile of ${shortWallet(t.wallet)}`}>
                <Avatar wallet={t.wallet} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${t.wallet === me ? "text-[#3dd68c]" : "text-slate-300"}`}>{shortWallet(t.wallet)}{t.wallet === me ? " (you)" : ""}</span>
                    <SideBadge side={t.side} />
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-slate-400">
                    <span className="font-display font-bold text-white">{t.token}</span>
                    {t.side === "swap" ? ` from ${t.fromSymbol}` : ""}
                  </span>
                </span>
              </button>
              <span className="shrink-0 text-right">
                <span className="block font-display text-sm font-bold tabular-nums text-white">{formatUsd(t.usd)}</span>
                <a
                  href={`https://cronoscan.com/tx/${t.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-end gap-0.5 text-xs text-slate-400 hover:text-[#f2b33d]"
                >
                  {timeAgo(t.createdAt)} ago <ExternalLink size={9} />
                </a>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ---------- Leaderboard ---------- */

export function Leaderboard({ account, onConnect, onOpenTrader }: { account: string | null; onConnect: () => void; onOpenTrader: (w: string) => void }) {
  const me = account?.toLowerCase()
  const { data, mutate } = useSWR<{ leaders: Leader[] }>(`/api/social?view=leaders${me ? `&wallet=${me}` : ""}`, fetchJson, { refreshInterval: 15000 })
  const leaders = data?.leaders

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 font-display text-xs font-bold tracking-normal text-slate-300">
        <Crown size={13} className="text-[#3dd68c]" /> Become a legend · top the board
      </div>
      {!leaders ? <Skeleton /> : leaders.length === 0 ? <Empty>No legends yet. Trade to claim the crown.</Empty> : (
        <ol className="max-h-[520px] overflow-y-auto">
          {leaders.map((l, i) => {
            const mine = l.wallet === me
            const podium = ["#3dd68c", "#f2b33d", "#f0616d"][i]
            return (
              <li key={l.wallet} className={`flex items-center gap-3 border-b border-white/[0.06] py-2.5 last:border-0 ${mine ? "bg-[#3dd68c]/[0.04]" : ""}`}>
                <span className="w-6 shrink-0 text-center font-display text-sm font-bold tabular-nums" style={{ color: podium ?? "#64748b" }}>{i + 1}</span>
                <button type="button" onClick={() => onOpenTrader(l.wallet)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar wallet={l.wallet} size={32} />
                  <span className="min-w-0">
                    <span className={`block font-mono text-xs ${mine ? "text-[#3dd68c]" : "text-slate-200"}`}>{shortWallet(l.wallet)}{mine ? " (you)" : ""}</span>
                    <span className="block text-[13px] text-slate-400">
                      {l.trades} trades · {formatUsd(l.volume)} vol · {l.followers} {l.followers === 1 ? "follower" : "followers"}
                    </span>
                  </span>
                </button>
                <span className="hidden shrink-0 text-right sm:block">
                  <span className="block font-display text-sm font-bold tabular-nums text-[#3dd68c]">{l.score.toLocaleString()}</span>
                  <span className="block font-display text-[11px] tracking-normal text-slate-400">score</span>
                </span>
                <FollowButton account={account} target={l.wallet} following={l.following} onConnect={onConnect} onChanged={() => mutate()} compact />
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-3 text-[13px] leading-5 text-slate-400">DegenScore = 10 points per swap + 1 point per $1 traded on MCRO.FUN. Trades in <span className="font-bold text-[#f2b33d]">$MERY</span> score 2x.</p>
    </div>
  )
}

/* ---------- Profile ---------- */

export function TraderProfile({ account, target, onConnect, onBack }: {
  account: string | null; target: string | null; onConnect: () => void; onBack?: () => void
}) {
  const me = account?.toLowerCase() ?? null
  const wallet = target ?? me
  const { data, mutate } = useSWR<Profile>(
    wallet ? `/api/social?view=profile&target=${wallet}${me ? `&wallet=${me}` : ""}` : null,
    fetchJson,
    { refreshInterval: 15000 },
  )

  if (!wallet) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-slate-300">Connect your wallet to see your trader card.</p>
        <button onClick={onConnect} className="rounded-md bg-[#3dd68c] px-4 py-2 font-display text-xs font-bold tracking-normal text-[#0e0f12]">Connect wallet</button>
      </div>
    )
  }

  const isMe = wallet === me
  const winRate = data && data.trades > 0 ? Math.round((data.sells / data.trades) * 100) : 0

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="mb-3 flex items-center gap-1 font-display text-xs font-bold tracking-normal text-slate-300 hover:text-white">
          <X size={12} /> Close profile
        </button>
      )}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#111317] p-4">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: `linear-gradient(90deg, hsl(${walletHue(wallet)} 90% 60%), #f0616d, #f2b33d)` }}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar wallet={wallet} size={48} />
            <div>
              <div className="font-mono text-sm text-white">{shortWallet(wallet)}{isMe ? " (you)" : ""}</div>
              <div className="mt-0.5 font-display text-xs tracking-normal text-slate-400">
                {data?.rank ? `Rank #${data.rank}` : "Unranked"} · {data?.followers ?? 0} followers · {data?.following ?? 0} following
              </div>
              {data?.firstTrade && <div className="text-xs text-slate-400">Degen since {new Date(data.firstTrade).toLocaleDateString()}</div>}
            </div>
          </div>
          {!isMe && data && <FollowButton account={account} target={wallet} following={data.isFollowing} onConnect={onConnect} onChanged={() => mutate()} />}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="DegenScore" value={data ? data.score.toLocaleString() : "…"} color="#3dd68c" />
          <Stat label="Volume" value={data ? formatUsd(data.volume) : "…"} />
          <Stat label="Net CRO flow" value={data ? formatUsd(data.netFlow) : "…"} color={data && data.netFlow < 0 ? "#f0616d" : "#3dd68c"} />
          <Stat label="Biggest trade" value={data ? formatUsd(data.biggest) : "…"} />
        </dl>

        {data && data.trades > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between font-display text-xs tracking-normal text-slate-400">
              <span className="text-[#3dd68c]">{data.buys} buys</span>
              <span>{data.trades} trades</span>
              <span className="text-[#f0616d]">{data.sells} sells</span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`${100 - winRate}% buys, ${winRate}% sells`}>
              <div className="bg-[#3dd68c]" style={{ width: `${(data.buys / data.trades) * 100}%` }} />
              <div className="ml-auto bg-[#f0616d]" style={{ width: `${(data.sells / data.trades) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      {data && data.topTokens.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 font-display text-xs font-bold tracking-normal text-slate-300">Favourite bags</div>
          <div className="flex flex-wrap gap-1.5">
            {data.topTokens.map((t) => (
              <span key={t.symbol} className="rounded-md border border-white/10 px-2 py-1 text-[13px]">
                <span className="font-display font-bold text-white">{t.symbol}</span>
                <span className="ml-1.5 tabular-nums text-slate-400">{t.trades}x · {formatUsd(t.volume)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 font-display text-xs font-bold tracking-normal text-slate-300">Recent trades</div>
        {!data ? <Skeleton /> : data.recent.length === 0 ? (
          <Empty>{isMe ? "No MCRO.FUN trades yet. Hit the Market tab and ape in." : "This wallet hasn't traded on MCRO.FUN yet."}</Empty>
        ) : (
          <TradeFeedList trades={data.recent} />
        )}
      </div>
      {isMe && <p className="mt-3 text-[13px] leading-5 text-slate-400">Net CRO flow is USD received from sells minus USD spent on buys through MCRO.FUN. It isn&apos;t unrealized PnL.</p>}
    </div>
  )
}

function TradeFeedList({ trades }: { trades: FeedTrade[] }) {
  return (
    <ol>
      {trades.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 text-xs last:border-0">
          <span className="flex items-center gap-2">
            <SideBadge side={t.side} />
            <span className="font-display font-bold text-white">{t.token}</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="tabular-nums text-slate-300">{formatUsd(t.usd)}</span>
            <a href={`https://cronoscan.com/tx/${t.txHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-[#f2b33d]">
              {timeAgo(t.createdAt)} <ExternalLink size={9} />
            </a>
          </span>
        </li>
      ))}
    </ol>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <dt className="font-display text-[11px] tracking-normal text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-display text-base font-bold tabular-nums" style={{ color: color ?? "#fff" }}>{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm leading-6 text-slate-400 text-pretty">{children}</p>
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 py-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-7 w-7 animate-pulse rounded-md bg-white/10" />
          <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
          <div className="ml-auto h-3 w-14 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  )
}
