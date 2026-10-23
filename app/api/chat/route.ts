import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { pool } from "@/lib/db"
import { CHAT_MAX_LENGTH, isChatRoom } from "@/lib/chat"

export const runtime = "nodejs"

const HISTORY_LIMIT = 60
const MIN_SECONDS_BETWEEN_MESSAGES = 2

type Row = { id: string; address: string; body: string; created_at: Date }

const toMessage = (r: Row) => ({ id: Number(r.id), address: r.address, body: r.body, createdAt: r.created_at.toISOString() })

export async function GET(req: Request) {
  const room = new URL(req.url).searchParams.get("room")
  if (!isChatRoom(room)) return NextResponse.json({ error: "Unknown room" }, { status: 400 })

  const { rows } = await pool.query<Row>(
    "SELECT id, address, body, created_at FROM merydex_chat_messages WHERE room = $1 ORDER BY id DESC LIMIT $2",
    [room, HISTORY_LIMIT],
  )
  const online = await pool.query<{ n: string }>(
    "SELECT COUNT(DISTINCT address) AS n FROM merydex_chat_messages WHERE room = $1 AND created_at > now() - interval '15 minutes'",
    [room],
  )

  return NextResponse.json(
    { messages: rows.reverse().map(toMessage), activeChatters: Number(online.rows[0]?.n ?? 0) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Connect and sign in with your wallet to chat" }, { status: 401 })

  const tokenHash = createHash("sha256").update(token).digest("hex")
  const session = await pool.query<{ address: string }>(
    "SELECT address FROM merydex_chat_sessions WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash],
  )
  const address = session.rows[0]?.address
  if (!address) return NextResponse.json({ error: "Chat session expired, please sign in again" }, { status: 401 })

  const payload = (await req.json().catch(() => null)) as { room?: string; body?: string } | null
  if (!isChatRoom(payload?.room)) return NextResponse.json({ error: "Unknown room" }, { status: 400 })

  const text = (payload?.body ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return NextResponse.json({ error: "Message is empty" }, { status: 400 })
  if (text.length > CHAT_MAX_LENGTH) return NextResponse.json({ error: `Keep it under ${CHAT_MAX_LENGTH} characters` }, { status: 400 })

  const recent = await pool.query(
    "SELECT 1 FROM merydex_chat_messages WHERE address = $1 AND created_at > now() - ($2 || ' seconds')::interval LIMIT 1",
    [address, String(MIN_SECONDS_BETWEEN_MESSAGES)],
  )
  if (recent.rowCount) return NextResponse.json({ error: "Slow down a little" }, { status: 429 })

  const { rows } = await pool.query<Row>(
    "INSERT INTO merydex_chat_messages (room, address, body) VALUES ($1, $2, $3) RETURNING id, address, body, created_at",
    [payload!.room, address, text],
  )
  return NextResponse.json({ message: toMessage(rows[0]) })
}
