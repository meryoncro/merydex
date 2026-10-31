import { NextResponse } from "next/server"
import { listHourly } from "@/lib/fcm"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

export async function GET(req: Request) {
  const limit = await rateLimit(`hourly:${clientIp(req)}`, 40, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }
  try {
    return NextResponse.json({ markets: await listHourly(), serverTime: Date.now() })
  } catch (err) {
    console.error("[hourly] upstream failed:", (err as Error).message)
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 })
  }
}
