import { NextResponse } from "next/server"

const TOKENS_BASE_URL = "https://api.dexscreener.com/latest/dex/tokens/"
const SEARCH_BASE_URL = "https://api.dexscreener.com/latest/dex/search?q="
const COINGECKO_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price"
const TOKEN_PATTERN = /^0x[a-fA-F0-9]{40}(?:,0x[a-fA-F0-9]{40})*$/
const MAX_TOKENS = 30
const REQUEST_TIMEOUT_MS = 8_000
const CHAIN_ID = "cronos"

/**
 * Pegged/wrapped assets (USDT, WBTC) are used almost exclusively as the quote
 * side on Cronos DEXs, so DexScreener indexes no pair for them and returns
 * nothing. Their price tracks a global asset 1:1, so we fall back to CoinGecko
 * for exactly these addresses when DexScreener can't resolve them.
 */
const COINGECKO_FALLBACK: Record<string, string> = {
  "0x66e428c3f67a68767596461f7ee3ec71a3a3bab5": "tether", // USDT
  "0x062e66477faf610ffafe27fcadc3c7e6390d4e9c": "wrapped-bitcoin", // WBTC
}

interface DexToken {
  address?: string
}

interface DexPair {
  chainId?: string
  baseToken?: DexToken
  quoteToken?: DexToken
  priceUsd?: string
  priceNative?: string
  priceChange?: { h24?: number }
  volume?: { h24?: number }
  liquidity?: { usd?: number }
  info?: { imageUrl?: string }
}

interface TokenStat {
  priceUsd: number | null
  change24h: number | null
  volume24h: number | null
  liquidityUsd: number | null
  imageUrl: string | null
}

const toNum = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  return Number.isFinite(parsed) ? parsed : null
}

async function fetchPairs(url: string, signal: AbortSignal): Promise<DexPair[]> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MeryDex/1.0" },
    cache: "no-store",
    signal,
  })
  if (!response.ok) return []
  const data = (await response.json()) as { pairs?: DexPair[] }
  return Array.isArray(data.pairs) ? data.pairs : []
}

/**
 * Resolves a single token's USD stats. DexScreener's token endpoint only
 * indexes a token when it is the BASE of a pair, so quote-only assets like
 * USDT/USDC/WBTC come back empty there. We therefore:
 *   1. try the token endpoint (base-side pairs),
 *   2. fall back to the search endpoint (returns base- AND quote-side pairs),
 *   3. pick the deepest-liquidity Cronos pair that includes the token, and
 *   4. compute the token's price from whichever side it sits on:
 *        priceUsd(base)  = pair.priceUsd
 *        priceUsd(quote) = pair.priceUsd / pair.priceNative
 */
async function fetchTokenStat(address: string, signal: AbortSignal): Promise<TokenStat | null> {
  const lower = address.toLowerCase()

  let pairs = await fetchPairs(`${TOKENS_BASE_URL}${address}`, signal)
  if (pairs.length === 0) {
    pairs = await fetchPairs(`${SEARCH_BASE_URL}${address}`, signal)
  }

  const relevant = pairs.filter((pair) => {
    if (pair.chainId && pair.chainId !== CHAIN_ID) return false
    const base = pair.baseToken?.address?.toLowerCase()
    const quote = pair.quoteToken?.address?.toLowerCase()
    return base === lower || quote === lower
  })

  if (relevant.length === 0) return null

  const best = relevant.reduce((a, b) =>
    (b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a,
  )

  const isBase = best.baseToken?.address?.toLowerCase() === lower
  const basePriceUsd = toNum(best.priceUsd)
  const priceNative = toNum(best.priceNative)

  let priceUsd: number | null = null
  if (isBase) {
    priceUsd = basePriceUsd
  } else if (basePriceUsd !== null && priceNative && priceNative !== 0) {
    // Token is the quote side: invert the base's USD price by the native ratio.
    priceUsd = basePriceUsd / priceNative
  }

  return {
    priceUsd,
    change24h: toNum(best.priceChange?.h24),
    volume24h: toNum(best.volume?.h24),
    liquidityUsd: toNum(best.liquidity?.usd),
    // Only trust the pair's logo when the requested token is the base token;
    // otherwise info.imageUrl belongs to the other asset.
    imageUrl: isBase ? best.info?.imageUrl ?? null : null,
  }
}

/**
 * Batches a single CoinGecko lookup for the given address→id map and returns
 * stats keyed by the original lowercased token address.
 */
async function fetchCoinGeckoFallback(
  addressToId: Record<string, string>,
  signal: AbortSignal,
): Promise<Record<string, TokenStat>> {
  const ids = [...new Set(Object.values(addressToId))]
  if (ids.length === 0) return {}

  const url = `${COINGECKO_PRICE_URL}?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  })
  if (!response.ok) return {}

  const data = (await response.json()) as Record<string, { usd?: number; usd_24h_change?: number }>
  const stats: Record<string, TokenStat> = {}

  for (const [address, id] of Object.entries(addressToId)) {
    const entry = data[id]
    if (!entry) continue
    stats[address] = {
      priceUsd: toNum(entry.usd),
      change24h: toNum(entry.usd_24h_change),
      volume24h: null,
      liquidityUsd: null,
      imageUrl: null,
    }
  }

  return stats
}

export async function GET(request: Request) {
  const tokens = new URL(request.url).searchParams.get("tokens")?.trim() ?? ""
  const tokenList = tokens.split(",").filter(Boolean)

  if (!tokens || tokenList.length === 0) {
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 })
  }

  if (tokenList.length > MAX_TOKENS || !TOKEN_PATTERN.test(tokens)) {
    return NextResponse.json({ error: "Invalid token address list" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const results = await Promise.allSettled(
      tokenList.map((address) => fetchTokenStat(address, controller.signal)),
    )

    const stats: Record<string, TokenStat> = {}
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        stats[tokenList[index].toLowerCase()] = result.value
      }
    })

    // Resolve pegged/wrapped assets DexScreener can't index on Cronos via a
    // single batched CoinGecko lookup.
    const unresolved: Record<string, string> = {}
    for (const address of tokenList) {
      const lower = address.toLowerCase()
      const id = COINGECKO_FALLBACK[lower]
      if (id && (!stats[lower] || stats[lower].priceUsd === null)) {
        unresolved[lower] = id
      }
    }

    if (Object.keys(unresolved).length > 0) {
      try {
        const fallback = await fetchCoinGeckoFallback(unresolved, controller.signal)
        Object.assign(stats, fallback)
      } catch (fallbackError) {
        console.error("[v0] CoinGecko fallback error", fallbackError)
      }
    }

    return NextResponse.json(
      { stats },
      { headers: { "Cache-Control": "private, max-age=15" } },
    )
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError"
    console.error("[v0] DexScreener market proxy error", error)
    return NextResponse.json(
      { error: isTimeout ? "DexScreener request timed out" : "Market proxy failed" },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
