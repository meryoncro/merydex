import { NextResponse, type NextRequest } from "next/server"
import { rateLimit } from "@/lib/rate-limit"

const WINDOW_SECONDS = 60
const READ_LIMIT = 300

// Per-IP, per-minute caps for state-changing or costly endpoints.
const WRITE_LIMITS: Record<string, number> = {
  "/api/execute": 10,
  "/api/chat/session": 10,
  "/api/chat": 20,
  "/api/social": 20,
  "/api/trades": 30,
  "/api/recurring": 20,
  "/api/arena": 40,
  "/api/quote": 90,
}
const DEFAULT_WRITE_LIMIT = 30

// Cron is already locked behind CRON_SECRET and must never be throttled.
const EXEMPT = new Set(["/api/recurring/run"])

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (EXEMPT.has(path)) return NextResponse.next()

  const ip = clientIp(req)
  const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS"

  const result = isWrite
    ? await rateLimit(`w:${path}:${ip}`, WRITE_LIMITS[path] ?? DEFAULT_WRITE_LIMIT, WINDOW_SECONDS)
    : await rateLimit(`r:${ip}`, READ_LIMIT, WINDOW_SECONDS)

  if (!result.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(result.retryAfter) } },
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
