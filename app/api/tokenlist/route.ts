import { NextResponse } from "next/server"

// WolfSwap publishes its whitelisted "more tokens" list across every chain it
// supports. MeryDEX is Cronos-only, so we filter to chainId 25, normalize to
// our Token shape, and cache the result. These tokens are swappable through the
// WolfSwap aggregator (our primary quote route), so surfacing them here makes
// them selectable without hardcoding hundreds of entries.
const WOLFSWAP_TOKENLIST = "https://api.wolfswap.app/factions/dex/tokenlist/more-tokens"
const CRONOS_CHAIN_ID = 25

interface WolfToken {
  chainId?: number
  address?: string
  name?: string
  symbol?: string
  decimals?: number
  logoURI?: string | null
}

// Deterministic accent color from the contract address so every imported token
// gets a stable badge color (used as the icon glow / fallback tile).
function colorFromAddress(address: string): string {
  let hash = 0
  for (let i = 2; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue} 70% 60%)`
}

const isAddress = (a: unknown): a is string => typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a)

export async function GET() {
  try {
    const res = await fetch(WOLFSWAP_TOKENLIST, {
      headers: { accept: "application/json" },
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      return NextResponse.json({ tokens: [], error: `upstream ${res.status}` }, { status: 200 })
    }
    const raw = (await res.json()) as WolfToken[]

    const seen = new Set<string>()
    const tokens = raw
      .filter((t) => t.chainId === CRONOS_CHAIN_ID && isAddress(t.address) && typeof t.decimals === "number")
      .filter((t) => {
        const key = (t.address as string).toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((t) => {
        const address = t.address as string
        return {
          address,
          symbol: (t.symbol || "?").slice(0, 16),
          name: (t.name || t.symbol || "Unknown").slice(0, 40),
          decimals: t.decimals as number,
          color: colorFromAddress(address),
          logoURI: t.logoURI || null,
        }
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol))

    return NextResponse.json({ tokens }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ tokens: [], error: (err as Error).message }, { status: 200 })
  }
}
