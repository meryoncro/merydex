import { NextResponse } from "next/server"
import { scanWhitelistTokens } from "@/lib/dexscan"

// Top 20 whitelist tokens on Cronos ranked by 24h volume.
const TOP_N = 20
const MIN_LIQUIDITY_USD = 2_000
const REQUEST_TIMEOUT_MS = 9_000

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const scanned = await scanWhitelistTokens(controller.signal)
    if (!scanned) return NextResponse.json({ tokens: [], error: "whitelist unavailable" }, { status: 200 })

    const tokens = scanned
      .filter((t) => t.volume24h > 0 && (t.liquidityUsd ?? 0) >= MIN_LIQUIDITY_USD)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, TOP_N)
      .map(({ address, symbol, name, priceUsd, change24h, volume24h, liquidityUsd, imageUrl }) => ({
        address, symbol, name, priceUsd, change24h, volume24h, liquidityUsd, imageUrl,
      }))

    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } })
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError"
    console.error("trending scan error", error)
    return NextResponse.json(
      { tokens: [], error: isTimeout ? "trending scan timed out" : "trending scan failed" },
      { status: 200 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
