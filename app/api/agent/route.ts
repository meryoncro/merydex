import { createAgentUIStreamResponse } from "ai"
import { meryAgent } from "@/lib/mery-agent"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_MESSAGES = 20
const MAX_BODY_BYTES = 64_000
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 10 * 60_000

// Best-effort per-instance limiter to keep a single visitor from draining AI credits.
const hits = new Map<string, number[]>()

function isRateLimited(key: string) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5_000) hits.clear()
  return recent.length > RATE_LIMIT
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon"
  if (isRateLimited(ip)) {
    return Response.json({ error: "Slow down, degen. Try again in a few minutes." }, { status: 429 })
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Conversation too long." }, { status: 413 })

  let messages: unknown
  try {
    messages = (JSON.parse(raw) as { messages?: unknown }).messages
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }

  return createAgentUIStreamResponse({
    agent: meryAgent,
    uiMessages: messages.slice(-MAX_MESSAGES),
    abortSignal: req.signal,
    onError: (error) => {
      console.error("[agent] stream failed:", error instanceof Error ? error.message : error)
      return "MERY could not answer right now. Please try again."
    },
  })
}
