import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { isArenaCollection } from "@/lib/ebisus"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface NftRef {
  nftId: string
  name?: string
  image?: string
  collection?: string
}

type Mode = "coin" | "rps"
const MOVES = ["rock", "paper", "scissors"] as const

interface MatchRow {
  id: string
  status: "waiting" | "resolved"
  mode: Mode
  p1_wallet: string
  p1_nft: NftRef
  p1_move: string | null
  p2_wallet: string | null
  p2_nft: NftRef | null
  p2_move: string | null
  winner: string | null
  created_at: string
  matched_at: string | null
  resolved_at: string | null
}

function serialize(row: MatchRow) {
  // Never leak a committed RPS move before the match resolves.
  const reveal = row.status === "resolved"
  return {
    id: row.id,
    status: row.status,
    mode: row.mode ?? "coin",
    p1: { wallet: row.p1_wallet, nft: row.p1_nft, move: reveal ? row.p1_move : null },
    p2: row.p2_wallet ? { wallet: row.p2_wallet, nft: row.p2_nft as NftRef, move: reveal ? row.p2_move : null } : null,
    winner: row.winner,
    createdAt: row.created_at,
    matchedAt: row.matched_at,
  }
}

const addr = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "")

function validNft(nft: unknown): nft is NftRef {
  if (!nft || typeof nft !== "object") return false
  const n = nft as Record<string, unknown>
  return typeof n.nftId === "string" && n.nftId.length > 0
}

// Purge abandoned queue entries so stale waiting rows don't pile up.
async function purgeStale() {
  await pool.query(`DELETE FROM arena_matches WHERE status = 'waiting' AND created_at < now() - interval '10 minutes'`)
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const action = body.action
  const wallet = addr(body.wallet)
  if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 })

  if (action === "join") {
    const nft = { ...(body.nft as NftRef) }
    if (!validNft(nft)) return NextResponse.json({ error: "Missing or invalid NFT" }, { status: 400 })
    if (!isArenaCollection(nft.collection ?? "mery")) {
      return NextResponse.json({ error: "Only MERY and Loaded Lions NFTs can enter the arena" }, { status: 400 })
    }
    const mode: Mode = body.mode === "rps" ? "rps" : "coin"
    const move = mode === "rps" ? body.move : null
    if (mode === "rps" && !MOVES.includes(move as (typeof MOVES)[number])) {
      return NextResponse.json({ error: "Pick rock, paper, or scissors" }, { status: 400 })
    }
    // Keep only the fields we care about.
    const nftRef: NftRef = { nftId: String(nft.nftId), name: nft.name, image: nft.image, collection: nft.collection ?? "mery" }

    await purgeStale()

    // A wallet queues for one mode at a time; switching modes replaces the old entry.
    await pool.query(`DELETE FROM arena_matches WHERE p1_wallet = $1 AND status = 'waiting' AND mode <> $2`, [wallet, mode])

    // If this wallet is already waiting in this mode, return that entry (don't double-queue).
    const existing = await pool.query<MatchRow>(
      `SELECT * FROM arena_matches WHERE p1_wallet = $1 AND status = 'waiting' AND mode = $2 ORDER BY created_at DESC LIMIT 1`,
      [wallet, mode],
    )
    if (existing.rows[0]) return NextResponse.json({ match: serialize(existing.rows[0]) })

    // Atomically claim the oldest waiting match in the same mode from a DIFFERENT
    // wallet and resolve the winner server-side in the same statement.
    // Coin: 50/50. RPS: standard rules, a tie resolves as a draw (winner NULL).
    const claimed = await pool.query<MatchRow>(
      `UPDATE arena_matches
         SET p2_wallet = $1,
             p2_nft = $2::jsonb,
             p2_move = $4::text,
             status = 'resolved',
             matched_at = now(),
             resolved_at = now(),
             winner = CASE
               WHEN $3::text = 'coin' THEN (CASE WHEN random() < 0.5 THEN p1_wallet ELSE $1 END)
               WHEN p1_move = $4::text THEN NULL
               WHEN (p1_move = 'rock' AND $4::text = 'scissors')
                 OR (p1_move = 'paper' AND $4::text = 'rock')
                 OR (p1_move = 'scissors' AND $4::text = 'paper') THEN p1_wallet
               ELSE $1
             END
       WHERE id = (
         SELECT id FROM arena_matches
         WHERE status = 'waiting' AND mode = $3::text AND p1_wallet <> $1
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [wallet, JSON.stringify(nftRef), mode, move],
    )
    if (claimed.rows[0]) return NextResponse.json({ match: serialize(claimed.rows[0]) })

    // No opponent waiting — create a new waiting match.
    const created = await pool.query<MatchRow>(
      `INSERT INTO arena_matches (p1_wallet, p1_nft, mode, p1_move) VALUES ($1, $2::jsonb, $3, $4) RETURNING *`,
      [wallet, JSON.stringify(nftRef), mode, move],
    )
    return NextResponse.json({ match: serialize(created.rows[0]) })
  }

  if (action === "leave") {
    const matchId = String(body.matchId || "")
    if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 })
    // Only allow leaving a still-waiting match you own.
    await pool.query(`DELETE FROM arena_matches WHERE id = $1 AND p1_wallet = $2 AND status = 'waiting'`, [
      matchId,
      wallet,
    ])
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action")

  if (action === "status") {
    const matchId = searchParams.get("matchId") || ""
    if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 })
    const r = await pool.query<MatchRow>(`SELECT * FROM arena_matches WHERE id = $1`, [matchId])
    return NextResponse.json({ match: r.rows[0] ? serialize(r.rows[0]) : null })
  }

  if (action === "stats") {
    const r = await pool.query<{
      battles: string
      battles_24h: string
      in_queue: string
      players: string
    }>(
      `SELECT
         (SELECT count(*) FROM arena_matches WHERE status = 'resolved') AS battles,
         (SELECT count(*) FROM arena_matches WHERE status = 'resolved' AND resolved_at > now() - interval '24 hours') AS battles_24h,
         (SELECT count(*) FROM arena_matches WHERE status = 'waiting') AS in_queue,
         (SELECT count(DISTINCT w) FROM (
            SELECT p1_wallet AS w FROM arena_matches
            UNION
            SELECT p2_wallet FROM arena_matches WHERE p2_wallet IS NOT NULL
         ) t) AS players`,
    )
    const row = r.rows[0]
    return NextResponse.json({
      stats: {
        battles: Number(row.battles),
        battles24h: Number(row.battles_24h),
        inQueue: Number(row.in_queue),
        players: Number(row.players),
      },
    })
  }

  if (action === "history") {
    const wallet = addr(searchParams.get("wallet"))
    if (!wallet) return NextResponse.json({ matches: [] })
    const r = await pool.query<MatchRow>(
      `SELECT * FROM arena_matches
        WHERE status = 'resolved' AND (p1_wallet = $1 OR p2_wallet = $1)
        ORDER BY resolved_at DESC LIMIT 12`,
      [wallet],
    )
    return NextResponse.json({ matches: r.rows.map(serialize) })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
