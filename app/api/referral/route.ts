import { NextResponse } from "next/server"
import { FEE_BPS } from "@/lib/fees"
import { rateLimit } from "@/lib/rate-limit"
import { sessionAddress } from "@/lib/session"
import {
  MIN_CLAIM_USD,
  REFERRAL_SHARE_BPS,
  bindReferral,
  codeFor,
  earningsFor,
  payoutsOf,
  referrerOf,
  refereesOf,
  requestPayout,
} from "@/lib/referral"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ADDR = /^0x[a-fA-F0-9]{40}$/

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet")?.toLowerCase() ?? ""
  if (!ADDR.test(wallet)) return NextResponse.json({ error: "invalid_wallet" }, { status: 400 })

  const limit = await rateLimit(`referral:get:${clientIp(req)}`, 60, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  try {
    const [code, earnings, referees, referredBy, payouts] = await Promise.all([
      codeFor(wallet),
      earningsFor(wallet),
      refereesOf(wallet),
      referrerOf(wallet),
      payoutsOf(wallet),
    ])
    return NextResponse.json({
      code,
      shareBps: REFERRAL_SHARE_BPS,
      feeBps: FEE_BPS,
      minClaimUsd: MIN_CLAIM_USD,
      referredBy,
      earnings,
      referees,
      payouts,
    })
  } catch (err) {
    console.error("[referral] load failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}

// Binding and claiming change state for a wallet, so both require its signed session.
export async function POST(req: Request) {
  const wallet = await sessionAddress(req)
  if (!wallet) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const limit = await rateLimit(`referral:post:${wallet}`, 10, 60)
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } })
  }

  const body = await req.json().catch(() => null)
  try {
    if (body?.action === "bind") {
      const result = await bindReferral(wallet, String(body.code ?? "").trim().toUpperCase())
      return NextResponse.json(result === "ok" ? { ok: true } : { error: result }, { status: result === "ok" ? 200 : 409 })
    }
    if (body?.action === "claim") {
      const result = await requestPayout(wallet)
      return NextResponse.json(result, { status: result.ok ? 200 : 409 })
    }
    return NextResponse.json({ error: "invalid_action" }, { status: 400 })
  } catch (err) {
    console.error("[referral] action failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
