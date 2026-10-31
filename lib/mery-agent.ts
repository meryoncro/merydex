import "server-only"
import { ToolLoopAgent, stepCountIs, tool, type InferAgentUIMessage } from "ai"
import { z } from "zod"
import { MERY_ADDRESS, MERY_SCORE_MULTIPLIER } from "@/lib/score"

const FETCH_TIMEOUT_MS = 8_000

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`Upstream responded ${res.status}`)
  return res.json() as Promise<T>
}

type DexPair = {
  chainId: string
  dexId: string
  url: string
  baseToken: { address: string; name: string; symbol: string }
  quoteToken: { symbol: string }
  priceUsd?: string
  priceChange?: { h1?: number; h24?: number }
  volume?: { h24?: number }
  liquidity?: { usd?: number }
  fdv?: number
  marketCap?: number
  txns?: { h24?: { buys: number; sells: number } }
}

const summarizePair = (p: DexPair) => ({
  chain: p.chainId,
  dex: p.dexId,
  pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
  name: p.baseToken.name.trim(),
  address: p.baseToken.address,
  priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
  change1hPct: p.priceChange?.h1 ?? null,
  change24hPct: p.priceChange?.h24 ?? null,
  volume24hUsd: p.volume?.h24 ?? null,
  liquidityUsd: p.liquidity?.usd ?? null,
  marketCapUsd: p.marketCap ?? p.fdv ?? null,
  buys24h: p.txns?.h24?.buys ?? null,
  sells24h: p.txns?.h24?.sells ?? null,
  chartUrl: p.url,
})

const searchTokens = tool({
  description:
    "Live DEX market data for any token by symbol, name, or contract address. Prefers Cronos pairs. Use for prices, 24h change, volume, liquidity and market cap of altcoins and Cronos tokens like $MERY.",
  inputSchema: z.object({
    query: z.string().min(1).max(80).describe("Token symbol, name, or contract address, e.g. 'MERY', 'VVS', '0x...'"),
  }),
  execute: async ({ query }) => {
    try {
      const data = await getJson<{ pairs: DexPair[] | null }>(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`)
      const pairs = (data.pairs ?? [])
        .sort((a, b) => Number(b.chainId === "cronos") - Number(a.chainId === "cronos") || (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
        .slice(0, 5)
        .map(summarizePair)
      return pairs.length ? { pairs } : { error: `No DEX pairs found for "${query}".` }
    } catch {
      return { error: "DEX data is temporarily unavailable." }
    }
  },
})

const getCoinPrices = tool({
  description:
    "Live USD price, 24h change, market cap and volume for major coins from CoinGecko. Use CoinGecko ids such as bitcoin, ethereum, solana, crypto-com-chain (CRO), binancecoin, ripple, tether.",
  inputSchema: z.object({
    ids: z.array(z.string().min(1).max(60)).min(1).max(10).describe("CoinGecko coin ids"),
  }),
  execute: async ({ ids }) => {
    try {
      const params = new URLSearchParams({
        ids: ids.join(","),
        vs_currencies: "usd",
        include_24hr_change: "true",
        include_market_cap: "true",
        include_24hr_vol: "true",
      })
      const data = await getJson<Record<string, { usd: number; usd_24h_change?: number; usd_market_cap?: number; usd_24h_vol?: number }>>(
        `https://api.coingecko.com/api/v3/simple/price?${params}`,
      )
      const coins = Object.entries(data).map(([id, v]) => ({
        id,
        priceUsd: v.usd,
        change24hPct: v.usd_24h_change ?? null,
        marketCapUsd: v.usd_market_cap ?? null,
        volume24hUsd: v.usd_24h_vol ?? null,
      }))
      return coins.length ? { coins } : { error: "No matching CoinGecko ids. Try searchTokens instead." }
    } catch {
      return { error: "Price data is temporarily unavailable." }
    }
  },
})

const getGlobalMarket = tool({
  description: "Snapshot of the whole crypto market: total market cap, 24h volume, 24h market cap change and BTC/ETH dominance.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const { data } = await getJson<{
        data: {
          total_market_cap: { usd: number }
          total_volume: { usd: number }
          market_cap_change_percentage_24h_usd: number
          market_cap_percentage: Record<string, number>
          active_cryptocurrencies: number
        }
      }>("https://api.coingecko.com/api/v3/global")
      return {
        totalMarketCapUsd: data.total_market_cap.usd,
        totalVolume24hUsd: data.total_volume.usd,
        marketCapChange24hPct: data.market_cap_change_percentage_24h_usd,
        btcDominancePct: data.market_cap_percentage.btc,
        ethDominancePct: data.market_cap_percentage.eth,
        activeCryptocurrencies: data.active_cryptocurrencies,
      }
    } catch {
      return { error: "Global market data is temporarily unavailable." }
    }
  },
})

const INSTRUCTIONS = `You are MERY, the coin mascot and AI guide of MERYDEX (MCRO.FUN), a DEX aggregator and arcade on the Cronos chain.

Scope: answer questions about crypto, blockchains, DeFi, tokens, trading concepts, and traditional financial markets (stocks, macro, rates, FX, commodities), plus how to use MERYDEX. If asked about something unrelated, say briefly that you only cover crypto and markets, then offer a related angle.

Live data: whenever a question depends on current prices, moves, volume, liquidity or market conditions, call a tool instead of guessing. Use searchTokens for Cronos and DEX tokens, getCoinPrices for major coins, getGlobalMarket for the overall market. State that figures are live snapshots. You have no live data for stocks or macro, so explain concepts and say current figures should be checked elsewhere.

About MERYDEX:
- $MERY is the platform's home token on Cronos, contract ${MERY_ADDRESS}. It is always pinned first in the swap list.
- Trades that buy or sell $MERY earn ${MERY_SCORE_MULTIPLIER}x DegenScore compared to other tokens.
- Tabs: Overview (trending tokens, stats), Swap (aggregated best-route swaps, Degen Arcade, DegenScore and profiles), Markets (volume and leaderboard), NFTs, Game (NFT battle arena), Portfolio (wallet balances and recurring buys).

Safety:
- You are not a financial advisor. Never promise returns, never tell users to buy or sell a specific asset, and frame ideas as education with risks.
- Flag red flags when relevant: very low liquidity, extreme price moves, concentrated holders, unverified contracts.
- Never ask for or accept seed phrases or private keys. If a user shares one, tell them to move funds to a new wallet immediately.

Style: friendly, upbeat, a little playful, but precise. Keep answers short (under ~150 words unless asked for depth). Write plain text. Use short "- " bullet lists when listing; no markdown headings, tables, bold or links syntax. Format money compactly ($1.2M, $0.0000024) and percentages with one decimal.`

export const meryAgent = new ToolLoopAgent({
  model: "openai/gpt-5-mini",
  instructions: INSTRUCTIONS,
  tools: { searchTokens, getCoinPrices, getGlobalMarket },
  stopWhen: stepCountIs(6),
})

export type MeryAgentUIMessage = InferAgentUIMessage<typeof meryAgent>
