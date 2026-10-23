import { TOKENS } from "@/lib/tokens"

export interface MarketStat {
  priceUsd: number | null
  change24h: number | null
  volume24h: number | null
  liquidityUsd: number | null
  imageUrl: string | null
}

export type MarketMap = Record<string, MarketStat>

/**
 * Fetches live market data for all tokens via the /api/market proxy. The proxy
 * resolves each token's USD price server-side (handling quote-only assets like
 * USDT/USDC/WBTC) and returns a map already keyed by lowercased address.
 */
export async function fetchMarketData(signal?: AbortSignal): Promise<MarketMap> {
  const addresses = TOKENS.map((t) => t.address).join(",")
  const res = await fetch(`/api/market?tokens=${addresses}`, { signal })
  if (!res.ok) throw new Error(`Market request failed: ${res.status}`)

  const data = (await res.json()) as { stats?: Record<string, MarketStat> }
  return data.stats ?? {}
}

export interface TrendingToken {
  address: string
  symbol: string
  name: string
  priceUsd: number | null
  change24h: number | null
  volume24h: number
  liquidityUsd: number | null
  imageUrl: string | null
}

/**
 * Fetches the top 20 tokens on Cronos ranked by 24h trading volume via the
 * /api/trending proxy, which scans MeryDEX's tradable universe on DexScreener.
 */
export async function fetchTrending(signal?: AbortSignal): Promise<TrendingToken[]> {
  const res = await fetch("/api/trending", { signal })
  if (!res.ok) throw new Error(`Trending request failed: ${res.status}`)
  const data = (await res.json()) as { tokens?: TrendingToken[] }
  return data.tokens ?? []
}

export interface ChainStats {
  volume24h: number | null
  liquidityUsd: number | null
  gasFeeUsd: number | null
  gasPriceGwei: number | null
  croPriceUsd: number | null
  activeAddresses: number | null
  activeSampleBlocks: number
}

/**
 * Fetches live Cronos ecosystem stats (DEX volume/liquidity, on-chain gas fee,
 * and active wallets) via the /api/chain-stats proxy. All values are real —
 * DexScreener for DEX aggregates and the Cronos RPC for gas and active senders.
 */
export async function fetchChainStats(signal?: AbortSignal): Promise<ChainStats> {
  const res = await fetch("/api/chain-stats", { signal })
  if (!res.ok) throw new Error(`Chain stats request failed: ${res.status}`)
  return (await res.json()) as ChainStats
}

export function formatGasFee(value: number | null): string {
  if (value === null) return "—"
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export function formatCount(value: number | null): string {
  if (value === null) return "—"
  return value.toLocaleString()
}

export function formatPrice(value: number | null): string {
  if (value === null) return "—"
  if (value === 0) return "$0.00"
  if (value < 0.01) return `$${value.toPrecision(2)}`
  if (value < 1) return `$${value.toFixed(4)}`
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatChange(value: number | null): string {
  if (value === null) return "—"
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

export function formatUsd(value: number | null): string {
  if (value === null) return "—"
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}
