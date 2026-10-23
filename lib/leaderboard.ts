export type LeaderRow = {
  rank: number
  wallet: string
  trades: number
  volume: number
  lastTraded: string
  firstTraded: string
}

export type LeaderboardTotals = {
  totalTrades: number
  totalWallets: number
  totalVolume: number
}

export type Leaderboard = {
  leaders: LeaderRow[]
  totals: LeaderboardTotals
}

// Fire-and-forget: record a confirmed MERYDEX swap so it counts on the
// leaderboard. Never throws — a failed record must not break the swap UX.
export async function recordTrade(input: {
  wallet: string
  txHash: string
  fromSymbol?: string
  toSymbol?: string
  fromAddress?: string
  toAddress?: string
  amountIn?: string
  usdValue?: number | null
}): Promise<void> {
  try {
    await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  } catch {
    // ignore — leaderboard recording is best-effort
  }
}

export async function fetchLeaderboard(signal?: AbortSignal): Promise<Leaderboard> {
  const res = await fetch("/api/leaderboard", { signal })
  if (!res.ok) throw new Error("leaderboard_unavailable")
  return res.json()
}

export function shortWallet(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  if (v > 0 && v < 0.01) return "<$0.01"
  return `$${v.toFixed(2)}`
}

export function timeAgo(iso: string): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
