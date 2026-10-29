/**
 * Scans MCRO.FUN's tradable universe (the WolfSwap whitelist) through
 * DexScreener's batch tokens endpoint and returns one row per token, built from
 * its deepest-liquidity Cronos pair. DexScreener has no chain-wide ranking feed
 * for Cronos, so callers rank these rows themselves.
 */
const WOLFSWAP_TOKENLIST = "https://api.wolfswap.app/factions/dex/tokenlist/more-tokens"
const DEX_TOKENS_URL = "https://api.dexscreener.com/latest/dex/tokens/"
const CRONOS_CHAIN_ID = 25
const CHAIN_ID = "cronos"
const BATCH_SIZE = 30
const MAX_BATCHES = 24

export const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "TUSD", "USDG", "USDD", "BUSD", "FRAX"])

export interface ScannedToken {
  address: string
  symbol: string
  name: string
  priceUsd: number | null
  change24h: number | null
  volume24h: number
  liquidityUsd: number | null
  swaps24h: number
  buys24h: number
  sells24h: number
  imageUrl: string | null
  marketCap: number | null
  pairCreatedAt: number | null
  frames: Record<Timeframe, TokenFrame>
}

export const TIMEFRAMES = ["m5", "h1", "h6", "h24"] as const
export type Timeframe = (typeof TIMEFRAMES)[number]
export interface TokenFrame {
  change: number | null
  volume: number
  buys: number
  sells: number
}

interface WolfToken {
  chainId?: number
  address?: string
  symbol?: string
}

interface DexPair {
  chainId?: string
  baseToken?: { address?: string; symbol?: string; name?: string }
  priceUsd?: string
  priceChange?: Partial<Record<Timeframe, number>>
  volume?: Partial<Record<Timeframe, number>>
  liquidity?: { usd?: number }
  txns?: Partial<Record<Timeframe, { buys?: number; sells?: number }>>
  info?: { imageUrl?: string }
  marketCap?: number
  fdv?: number
  pairCreatedAt?: number
}

const toNum = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  return Number.isFinite(parsed) ? parsed : null
}

const isAddress = (a: unknown): a is string => typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a)

async function fetchWhitelist(signal: AbortSignal): Promise<string[]> {
  const res = await fetch(WOLFSWAP_TOKENLIST, {
    headers: { accept: "application/json" },
    next: { revalidate: 3600 },
    signal,
  })
  if (!res.ok) return []
  const raw = (await res.json()) as WolfToken[]
  const seen = new Set<string>()
  const addresses: string[] = []
  for (const t of raw) {
    if (t.chainId !== CRONOS_CHAIN_ID || !isAddress(t.address)) continue
    if (STABLE_SYMBOLS.has((t.symbol || "").toUpperCase())) continue
    const lower = t.address.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    addresses.push(t.address)
  }
  return addresses
}

async function fetchBatch(addresses: string[], signal: AbortSignal): Promise<DexPair[]> {
  const res = await fetch(`${DEX_TOKENS_URL}${addresses.join(",")}`, {
    headers: { Accept: "application/json", "User-Agent": "MCRO.FUN/1.0" },
    cache: "no-store",
    signal,
  })
  if (!res.ok) return []
  const data = (await res.json()) as { pairs?: DexPair[] }
  return Array.isArray(data.pairs) ? data.pairs : []
}

export async function scanWhitelistTokens(signal: AbortSignal): Promise<ScannedToken[] | null> {
  const candidates = await fetchWhitelist(signal)
  if (candidates.length === 0) return null

  const batches: string[][] = []
  for (let i = 0; i < candidates.length && batches.length < MAX_BATCHES; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE))
  }

  const results = await Promise.allSettled(batches.map((b) => fetchBatch(b, signal)))
  const whitelisted = new Set(candidates.map((a) => a.toLowerCase()))

  const best = new Map<string, DexPair>()
  for (const result of results) {
    if (result.status !== "fulfilled") continue
    for (const pair of result.value) {
      if (pair.chainId !== CHAIN_ID) continue
      const base = pair.baseToken?.address?.toLowerCase()
      if (!base || !whitelisted.has(base)) continue
      const current = best.get(base)
      if (!current || (pair.liquidity?.usd ?? 0) > (current.liquidity?.usd ?? 0)) best.set(base, pair)
    }
  }

  const tokens: ScannedToken[] = []
  for (const [address, pair] of best) {
    const symbol = pair.baseToken?.symbol || "?"
    if (STABLE_SYMBOLS.has(symbol.toUpperCase())) continue
    const buys24h = toNum(pair.txns?.h24?.buys) ?? 0
    const sells24h = toNum(pair.txns?.h24?.sells) ?? 0
    tokens.push({
      address,
      symbol: symbol.slice(0, 16),
      name: (pair.baseToken?.name || symbol).slice(0, 40),
      priceUsd: toNum(pair.priceUsd),
      change24h: toNum(pair.priceChange?.h24),
      volume24h: toNum(pair.volume?.h24) ?? 0,
      liquidityUsd: toNum(pair.liquidity?.usd),
      swaps24h: buys24h + sells24h,
      buys24h,
      sells24h,
      imageUrl: pair.info?.imageUrl ?? null,
      marketCap: toNum(pair.marketCap) ?? toNum(pair.fdv),
      pairCreatedAt: toNum(pair.pairCreatedAt),
      frames: Object.fromEntries(
        TIMEFRAMES.map((tf) => [
          tf,
          {
            change: toNum(pair.priceChange?.[tf]),
            volume: toNum(pair.volume?.[tf]) ?? 0,
            buys: toNum(pair.txns?.[tf]?.buys) ?? 0,
            sells: toNum(pair.txns?.[tf]?.sells) ?? 0,
          },
        ]),
      ) as Record<Timeframe, TokenFrame>,
    })
  }
  return tokens
}
