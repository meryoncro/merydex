import { NextResponse } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { getAddress, isAddress, verifyMessage } from "ethers"
import { pool } from "@/lib/db"
import { chatSignInMessage } from "@/lib/chat"

export const runtime = "nodejs"

const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000
const SESSION_DAYS = 7

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { address?: string; issuedAt?: string; signature?: string } | null
  const { address, issuedAt, signature } = body ?? {}

  if (!address || !isAddress(address) || !issuedAt || !signature) {
    return NextResponse.json({ error: "Missing sign-in details" }, { status: 400 })
  }

  const issuedMs = Date.parse(issuedAt)
  if (!Number.isFinite(issuedMs) || Math.abs(Date.now() - issuedMs) > MAX_SIGNATURE_AGE_MS) {
    return NextResponse.json({ error: "Sign-in expired, please try again" }, { status: 400 })
  }

  const wallet = getAddress(address)
  let recovered: string
  try {
    recovered = verifyMessage(chatSignInMessage(wallet, issuedAt), signature)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  if (recovered !== wallet) return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 })

  const token = randomBytes(32).toString("hex")
  const tokenHash = createHash("sha256").update(token).digest("hex")
  await pool.query("DELETE FROM merydex_chat_sessions WHERE expires_at < now()")
  await pool.query(
    `INSERT INTO merydex_chat_sessions (token_hash, address, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [tokenHash, wallet.toLowerCase(), String(SESSION_DAYS)],
  )

  return NextResponse.json({ token, address: wallet.toLowerCase() })
}
