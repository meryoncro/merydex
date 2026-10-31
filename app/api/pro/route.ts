import { NextResponse } from "next/server"
import { INSTRUMENT_RE, TIMEFRAMES, instrumentView, topTickers, type Timeframe } from "@/lib/cdc"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

export async function GET(req: Request) {
  const limit = await rateLimit(`pro:${clientIp(req)}`, 120, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const params = new URL(req.url).searchParams
  try {
    if (params.get("view") === "tickers") {
      return NextResponse.json({ tickers: await topTickers() })
    }
    const instrument = params.get("instrument")?.toUpperCase() ?? ""
    const tf = (params.get("tf") ?? "1h") as Timeframe
    if (!INSTRUMENT_RE.test(instrument) || !TIMEFRAMES.includes(tf)) {
      return NextResponse.json({ error: "invalid_params" }, { status: 400 })
    }
    return NextResponse.json(await instrumentView(instrument, tf))
  } catch (err) {
    console.error("[pro] upstream failed:", (err as Error).message)
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 })
  }
}
