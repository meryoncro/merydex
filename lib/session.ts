import { createHash } from "node:crypto"
import { pool } from "@/lib/db"

/** Resolves the wallet behind a signed-in MCRO.FUN session (shared with chat). */
export async function sessionAddress(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return null
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const { rows } = await pool.query<{ address: string }>(
    "SELECT address FROM merydex_chat_sessions WHERE token_hash = $1 AND expires_at > now()",
    [tokenHash],
  )
  return rows[0]?.address.toLowerCase() ?? null
}
