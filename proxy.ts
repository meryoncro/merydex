import { NextResponse, type NextRequest } from "next/server"
import { APP_URL, SITE_URL, isAppHost, isSiteHost } from "@/lib/domains"
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
  "/api/arena": 40,
  "/api/quote": 90,
}
const DEFAULT_WRITE_LIMIT = 30


const SITE_PATH = "/site"

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
}

async function limitApi(req: NextRequest, path: string) {
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

// mcro.fun is the information site; app.mcro.fun is the dApp. Any other host
// (localhost, v0 preview, *.vercel.app) serves both, with the site at /site.
function routeByHost(req: NextRequest, path: string) {
  const host = req.headers.get("host")
  const search = req.nextUrl.search

  if (isSiteHost(host)) {
    // Invite links must land where the wallet connects.
    if (path === "/" && !req.nextUrl.searchParams.has("ref")) {
      return NextResponse.rewrite(new URL(SITE_PATH, req.url))
    }
    if (path === SITE_PATH) return NextResponse.redirect(SITE_URL, 308)
    return NextResponse.redirect(`${APP_URL}${path}${search}`, 308)
  }

  if (isAppHost(host) && (path === SITE_PATH || path.startsWith(`${SITE_PATH}/`))) {
    return NextResponse.redirect(SITE_URL, 308)
  }

  return NextResponse.next()
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (path.startsWith("/api/")) return limitApi(req, path)
  return routeByHost(req, path)
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/|images/|chains/|favicon|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|txt|xml|webmanifest)$).*)",
  ],
}
