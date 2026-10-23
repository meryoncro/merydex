import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export const dynamic = "force-dynamic"

// Leaderboard of unique wallets that have traded on MERYDEX, ranked by total
// USD volume then trade count. Also returns platform-wide totals.
export async function GET() {
  try {
    const [rows, totals] = await Promise.all([
      pool.query(
        `SELECT wallet,
                COUNT(*)::int                       AS trades,
                COALESCE(SUM(usd_value), 0)::float8 AS volume,
                MAX(created_at)                     AS last_traded,
                MIN(created_at)                     AS first_traded
         FROM merydex_trades
         GROUP BY wallet
         ORDER BY volume DESC, trades DESC, last_traded DESC
         LIMIT 100`,
      ),
      pool.query(
        `SELECT COUNT(*)::int                       AS total_trades,
                COUNT(DISTINCT wallet)::int         AS total_wallets,
                COALESCE(SUM(usd_value), 0)::float8 AS total_volume
         FROM merydex_trades`,
      ),
    ])

    const leaders = rows.rows.map((r, i) => ({
      rank: i + 1,
      wallet: r.wallet as string,
      trades: r.trades as number,
      volume: r.volume as number,
      lastTraded: r.last_traded as string,
      firstTraded: r.first_traded as string,
    }))

    const t = totals.rows[0] ?? {}
    return NextResponse.json({
      leaders,
      totals: {
        totalTrades: t.total_trades ?? 0,
        totalWallets: t.total_wallets ?? 0,
        totalVolume: t.total_volume ?? 0,
      },
    })
  } catch (err) {
    console.log("[v0] leaderboard query failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
