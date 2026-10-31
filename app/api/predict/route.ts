import { NextResponse } from "next/server"
import { GROUPS, UUID_RE, getEvent, listEvents } from "@/lib/cdc"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
const CURSOR_RE = /^\d{1,3}$/

export async function GET(req: Request) {
  const limit = await rateLimit(`predict:${clientIp(req)}`, 90, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const params = new URL(req.url).searchParams
  try {
    const eventId = params.get("event")
    if (eventId) {
      if (!UUID_RE.test(eventId)) return NextResponse.json({ error: "invalid_event" }, { status: 400 })
      const event = await getEvent(eventId)
      return event ? NextResponse.json({ event }) : NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const group = params.get("group") ?? ""
    const q = (params.get("q") ?? "").trim().slice(0, 80)
    const cursor = params.get("cursor") ?? ""
    if ((group && !(group in GROUPS)) || (cursor && !CURSOR_RE.test(cursor))) {
      return NextResponse.json({ error: "invalid_params" }, { status: 400 })
    }
    return NextResponse.json(await listEvents({ group: group || undefined, q: q || undefined, page: cursor ? Number(cursor) : 0 }))
  } catch (err) {
    console.error("[predict] upstream failed:", (err as Error).message)
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 })
  }
}
