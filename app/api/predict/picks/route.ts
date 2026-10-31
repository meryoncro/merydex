import { NextResponse } from "next/server"
import { UUID_RE } from "@/lib/cdc"
import { MIN_STAKE, closePick, leaderboard, openPick, portfolioFor } from "@/lib/predict-picks"
import { rateLimit } from "@/lib/rate-limit"
import { sessionAddress } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ADDR = /^0x[a-fA-F0-9]{40}$/
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

export async function GET(req: Request) {
  const limit = await rateLimit(`picks:get:${clientIp(req)}`, 60, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }
  const wallet = new URL(req.url).searchParams.get("wallet")?.toLowerCase() ?? ""
  try {
    const [portfolio, leaders] = await Promise.all([ADDR.test(wallet) ? portfolioFor(wallet) : null, leaderboard()])
    return NextResponse.json({ portfolio, leaders, minStake: MIN_STAKE })
  } catch (err) {
    console.error("[picks] load failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const wallet = await sessionAddress(req)
  if (!wallet) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const limit = await rateLimit(`picks:post:${wallet}`, 20, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const body = await req.json().catch(() => null)
  try {
    if (body?.action === "open") {
      const stake = Number(body.stake)
      const side = body.side
      if (
        !UUID_RE.test(String(body.eventId)) ||
        !UUID_RE.test(String(body.contractId)) ||
        (side !== "yes" && side !== "no") ||
        !Number.isInteger(stake) ||
        stake < MIN_STAKE ||
        stake > 100_000
      ) {
        return NextResponse.json({ error: "invalid_pick" }, { status: 400 })
      }
      const result = await openPick(wallet, { eventId: body.eventId, contractId: body.contractId, side, stake })
      return NextResponse.json(result, { status: result.ok ? 200 : 409 })
    }
    if (body?.action === "close") {
      const id = String(body.id ?? "")
      if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ error: "invalid_pick" }, { status: 400 })
      const result = await closePick(wallet, id)
      return NextResponse.json(result, { status: result.ok ? 200 : 409 })
    }
    return NextResponse.json({ error: "invalid_action" }, { status: 400 })
  } catch (err) {
    console.error("[picks] action failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
