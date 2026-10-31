import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { SCORE_SQL } from "@/lib/score"

export const dynamic = "force-dynamic"

// DegenScore is derived from recorded MCRO.FUN trades so it can't be farmed
// client-side: 10 points per swap plus 1 point per USD traded, doubled for $MERY.

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet")?.toLowerCase() ?? null
  if (wallet && !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 })
  }

  try {
    const top = await pool.query(
      `SELECT wallet, COUNT(*)::int AS trades, ${SCORE_SQL} AS score
       FROM merydex_trades
       GROUP BY wallet
       ORDER BY score DESC, trades DESC
       LIMIT 5`,
    )

    let me: { score: number; trades: number; rank: number | null } | null = null
    if (wallet) {
      const mine = await pool.query(
        `WITH scores AS (
           SELECT LOWER(wallet) AS wallet, COUNT(*)::int AS trades, ${SCORE_SQL} AS score
           FROM merydex_trades
           GROUP BY LOWER(wallet)
         )
         SELECT trades, score,
                (SELECT COUNT(*)::int + 1 FROM scores s2 WHERE s2.score > s.score) AS rank
         FROM scores s
         WHERE wallet = $1`,
        [wallet],
      )
      const row = mine.rows[0]
      me = row ? { score: row.score, trades: row.trades, rank: row.rank } : { score: 0, trades: 0, rank: null }
    }

    return NextResponse.json({
      me,
      top: top.rows.map((r) => ({ wallet: r.wallet as string, trades: r.trades as number, score: r.score as number })),
    })
  } catch (err) {
    console.error("degenscore query failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
