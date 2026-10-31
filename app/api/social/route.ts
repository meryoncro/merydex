import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { sessionAddress } from "@/lib/session"
import { SCORE_SQL } from "@/lib/score"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ADDRESS_RE = /^0x[a-f0-9]{40}$/
const MAX_WATCHLIST = 100
const MAX_FOLLOWING = 200
const NATIVE = `('CRO','WCRO')`
const SIDE_SQL = `CASE WHEN UPPER(from_symbol) IN ${NATIVE} THEN 'buy' WHEN UPPER(to_symbol) IN ${NATIVE} THEN 'sell' ELSE 'swap' END`

const noStore = { headers: { "Cache-Control": "no-store" } }
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const asAddress = (v: string | null | undefined) => {
  const a = v?.toLowerCase() ?? null
  return a && ADDRESS_RE.test(a) ? a : null
}

type TradeRow = {
  id: number; wallet: string; tx_hash: string; side: string
  from_symbol: string; to_symbol: string; to_address: string | null; from_address: string | null
  usd_value: string | null; created_at: Date
}

const toTrade = (r: TradeRow) => ({
  id: r.id,
  wallet: r.wallet.toLowerCase(),
  txHash: r.tx_hash,
  side: r.side as "buy" | "sell" | "swap",
  fromSymbol: r.from_symbol,
  toSymbol: r.to_symbol,
  token: r.side === "sell" ? r.from_symbol : r.to_symbol,
  tokenAddress: (r.side === "sell" ? r.from_address : r.to_address)?.toLowerCase() ?? null,
  usd: r.usd_value == null ? null : Number(r.usd_value),
  createdAt: r.created_at.toISOString(),
})

const TRADE_COLS = `id, wallet, tx_hash, ${SIDE_SQL} AS side, from_symbol, to_symbol, from_address, to_address, usd_value, created_at`

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const view = params.get("view")
  const wallet = asAddress(params.get("wallet"))
  if (params.get("wallet") && !wallet) return bad("invalid_wallet")

  try {
    if (view === "feed") {
      const following = params.get("scope") === "following"
      if (following && !wallet) return NextResponse.json({ trades: [] }, noStore)
      const { rows } = following
        ? await pool.query<TradeRow>(
            `SELECT ${TRADE_COLS} FROM merydex_trades
             WHERE LOWER(wallet) IN (SELECT followee FROM merydex_follows WHERE follower = $1)
             ORDER BY created_at DESC LIMIT 40`,
            [wallet],
          )
        : await pool.query<TradeRow>(`SELECT ${TRADE_COLS} FROM merydex_trades ORDER BY created_at DESC LIMIT 40`)
      return NextResponse.json({ trades: rows.map(toTrade) }, noStore)
    }

    if (view === "leaders") {
      const { rows } = await pool.query(
        `WITH s AS (
           SELECT LOWER(wallet) AS wallet, COUNT(*)::int AS trades, ${SCORE_SQL} AS score,
                  COALESCE(SUM(usd_value), 0)::float AS volume, MAX(created_at) AS last_trade
           FROM merydex_trades GROUP BY LOWER(wallet)
         )
         SELECT s.*,
                (SELECT COUNT(*)::int FROM merydex_follows f WHERE f.followee = s.wallet) AS followers,
                ($1::text IS NOT NULL AND EXISTS (SELECT 1 FROM merydex_follows f WHERE f.follower = $1 AND f.followee = s.wallet)) AS following
         FROM s ORDER BY score DESC, trades DESC LIMIT 25`,
        [wallet],
      )
      return NextResponse.json(
        {
          leaders: rows.map((r) => ({
            wallet: r.wallet as string, trades: r.trades as number, score: r.score as number,
            volume: r.volume as number, followers: r.followers as number, following: r.following as boolean,
            lastTrade: (r.last_trade as Date).toISOString(),
          })),
        },
        noStore,
      )
    }

    if (view === "profile") {
      const target = asAddress(params.get("target")) ?? wallet
      if (!target) return bad("wallet_required")
      const [stats, tokens, recent, graph] = await Promise.all([
        pool.query(
          `WITH all_s AS (SELECT LOWER(wallet) AS wallet, ${SCORE_SQL} AS score FROM merydex_trades GROUP BY LOWER(wallet)),
           me AS (
             SELECT COUNT(*)::int AS trades, ${SCORE_SQL} AS score,
                    COALESCE(SUM(usd_value), 0)::float AS volume,
                    COUNT(*) FILTER (WHERE ${SIDE_SQL} = 'buy')::int AS buys,
                    COUNT(*) FILTER (WHERE ${SIDE_SQL} = 'sell')::int AS sells,
                    COALESCE(SUM(usd_value) FILTER (WHERE ${SIDE_SQL} = 'sell'), 0)::float
                      - COALESCE(SUM(usd_value) FILTER (WHERE ${SIDE_SQL} = 'buy'), 0)::float AS net_flow,
                    COALESCE(MAX(usd_value), 0)::float AS biggest,
                    MIN(created_at) AS first_trade
             FROM merydex_trades WHERE LOWER(wallet) = $1
           )
           SELECT me.*, (SELECT COUNT(*)::int + 1 FROM all_s WHERE all_s.score > me.score) AS rank FROM me`,
          [target],
        ),
        pool.query(
          `SELECT CASE WHEN ${SIDE_SQL} = 'sell' THEN from_symbol ELSE to_symbol END AS symbol,
                  COUNT(*)::int AS trades, COALESCE(SUM(usd_value), 0)::float AS volume
           FROM merydex_trades WHERE LOWER(wallet) = $1
           GROUP BY 1 ORDER BY volume DESC, trades DESC LIMIT 5`,
          [target],
        ),
        pool.query<TradeRow>(
          `SELECT ${TRADE_COLS} FROM merydex_trades WHERE LOWER(wallet) = $1 ORDER BY created_at DESC LIMIT 12`,
          [target],
        ),
        pool.query(
          `SELECT (SELECT COUNT(*)::int FROM merydex_follows WHERE followee = $1) AS followers,
                  (SELECT COUNT(*)::int FROM merydex_follows WHERE follower = $1) AS following,
                  EXISTS (SELECT 1 FROM merydex_follows WHERE follower = $2 AND followee = $1) AS is_following`,
          [target, wallet],
        ),
      ])
      const s = stats.rows[0]
      const g = graph.rows[0]
      return NextResponse.json(
        {
          wallet: target,
          trades: s.trades, score: s.score, rank: s.trades > 0 ? s.rank : null, volume: s.volume,
          buys: s.buys, sells: s.sells, netFlow: s.net_flow, biggest: s.biggest,
          firstTrade: s.first_trade ? (s.first_trade as Date).toISOString() : null,
          followers: g.followers, following: g.following, isFollowing: g.is_following,
          topTokens: tokens.rows,
          recent: recent.rows.map(toTrade),
        },
        noStore,
      )
    }

    if (view === "watchlist") {
      if (!wallet) return NextResponse.json({ tokens: [] }, noStore)
      const { rows } = await pool.query<{ token: string }>(
        "SELECT token FROM merydex_watchlist WHERE address = $1 ORDER BY created_at DESC",
        [wallet],
      )
      return NextResponse.json({ tokens: rows.map((r) => r.token) }, noStore)
    }

    return bad("unknown_view")
  } catch (err) {
    console.error("social query failed:", (err as Error).message)
    return bad("server_error", 500)
  }
}

export async function POST(req: Request) {
  const me = await sessionAddress(req)
  if (!me) return bad("Sign in with your wallet first", 401)

  const body = (await req.json().catch(() => null)) as { action?: string; target?: string } | null
  const target = asAddress(body?.target)
  if (!target) return bad("Invalid address")

  try {
    switch (body?.action) {
      case "follow": {
        if (target === me) return bad("You can't follow yourself")
        const { rows } = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM merydex_follows WHERE follower = $1", [me])
        if ((rows[0]?.n ?? 0) >= MAX_FOLLOWING) return bad(`Following limit is ${MAX_FOLLOWING}`)
        await pool.query("INSERT INTO merydex_follows (follower, followee) VALUES ($1, $2) ON CONFLICT DO NOTHING", [me, target])
        break
      }
      case "unfollow":
        await pool.query("DELETE FROM merydex_follows WHERE follower = $1 AND followee = $2", [me, target])
        break
      case "watch": {
        const { rows } = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM merydex_watchlist WHERE address = $1", [me])
        if ((rows[0]?.n ?? 0) >= MAX_WATCHLIST) return bad(`Watchlist limit is ${MAX_WATCHLIST}`)
        await pool.query("INSERT INTO merydex_watchlist (address, token) VALUES ($1, $2) ON CONFLICT DO NOTHING", [me, target])
        break
      }
      case "unwatch":
        await pool.query("DELETE FROM merydex_watchlist WHERE address = $1 AND token = $2", [me, target])
        break
      default:
        return bad("Unknown action")
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("social write failed:", (err as Error).message)
    return bad("server_error", 500)
  }
}
