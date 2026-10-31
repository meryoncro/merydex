import { NextResponse } from "next/server"
import { scanWhitelistTokens, type ScannedToken } from "@/lib/dexscan"
import { isMery } from "@/lib/score"

// Degen Arcade token list: every active whitelist token, ranked by 24h swap count.
// $MERY is always included, even on a quiet day.
const MIN_LIQUIDITY_USD = 2_000
const REQUEST_TIMEOUT_MS = 20_000

const bySwaps = (a: ScannedToken, b: ScannedToken) => b.swaps24h - a.swaps24h || b.volume24h - a.volume24h

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const scanned = await scanWhitelistTokens(controller.signal)
    if (!scanned) return NextResponse.json({ error: "whitelist unavailable" }, { status: 502 })

    const tokens = scanned.filter((t) => isMery(t.address) || (t.swaps24h > 0 && (t.liquidityUsd ?? 0) >= MIN_LIQUIDITY_USD)).sort(bySwaps)

    return NextResponse.json(
      { tokens, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    )
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError"
    console.error("arcade scan error", error)
    return NextResponse.json({ error: isTimeout ? "scan timed out" : "scan failed" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
