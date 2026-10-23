import { NextResponse } from "next/server"
import { TOKENS } from "@/lib/tokens"

// Live Cronos on-chain + DEX ecosystem stats for the Overview highlight cards.
// Sources (all real, no mock values):
//   - 24h volume / total liquidity: DexScreener, summed over the tracked token
//     pairs and deduped by pair address.
//   - Avg gas fee: RPC_URL (eth_gasPrice) -> USD cost of a standard transfer,
//     priced with the live CRO/USD from DexScreener.
//   - Active addresses: RPC_URL, distinct tx senders across a recent window of
//     blocks (genuine on-chain activity; the Cronos explorer's aggregate stats
//     API is key-gated and not available to this project).
export const dynamic = "force-dynamic"
export const revalidate = 0

const RPC = process.env.RPC_URL
const WCRO = (process.env.WCRO || "").toLowerCase()
const STANDARD_TRANSFER_GAS = 21_000
const ACTIVE_SAMPLE_BLOCKS = 40

interface ChainStats {
  volume24h: number | null
  liquidityUsd: number | null
  gasFeeUsd: number | null
  gasPriceGwei: number | null
  croPriceUsd: number | null
  activeAddresses: number | null
  activeSampleBlocks: number
}

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : null
}

async function rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T | null> {
  if (!RPC) return null
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    })
    const json = (await res.json()) as { result?: T; error?: { message?: string } }
    if (json.error) return null
    return json.result ?? null
  } catch {
    return null
  }
}

interface DexPair {
  chainId?: string
  pairAddress?: string
  priceUsd?: string
  baseToken?: { address?: string }
  quoteToken?: { address?: string }
  volume?: { h24?: number }
  liquidity?: { usd?: number }
}

// Fetch every DEX pair that references our tracked tokens, dedupe by pair
// address so shared pairs (e.g. WCRO/MERY) are only counted once, then sum.
async function fetchDexAggregate(): Promise<{
  volume24h: number | null
  liquidityUsd: number | null
  croPriceUsd: number | null
}> {
  const addresses = TOKENS.map((t) => t.address.toLowerCase())
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses.join(",")}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return { volume24h: null, liquidityUsd: null, croPriceUsd: null }
    const data = (await res.json()) as { pairs?: DexPair[] }
    const pairs = (data.pairs ?? []).filter((p) => p.chainId === "cronos")

    const seen = new Set<string>()
    let volume = 0
    let liquidity = 0
    let croPrice: number | null = null

    for (const p of pairs) {
      const id = p.pairAddress?.toLowerCase()
      if (!id || seen.has(id)) continue
      seen.add(id)
      volume += toNum(p.volume?.h24) ?? 0
      liquidity += toNum(p.liquidity?.usd) ?? 0

      // Derive CRO/USD from any pair whose base token is WCRO.
      if (croPrice === null && WCRO && p.baseToken?.address?.toLowerCase() === WCRO) {
        croPrice = toNum(p.priceUsd)
      }
    }

    return {
      volume24h: seen.size ? volume : null,
      liquidityUsd: seen.size ? liquidity : null,
      croPriceUsd: croPrice,
    }
  } catch {
    return { volume24h: null, liquidityUsd: null, croPriceUsd: null }
  }
}

interface RpcBlock {
  transactions?: { from?: string }[]
}

// Count distinct transaction senders across the most recent blocks — a live,
// on-chain measure of wallets currently active on Cronos.
async function fetchActiveAddresses(): Promise<number | null> {
  const latestHex = await rpcCall<string>("eth_blockNumber", [])
  if (!latestHex) return null
  const latest = Number(BigInt(latestHex))
  if (!Number.isFinite(latest)) return null

  const numbers = Array.from({ length: ACTIVE_SAMPLE_BLOCKS }, (_, i) => latest - i).filter((n) => n >= 0)
  const blocks = await Promise.all(
    numbers.map((n) => rpcCall<RpcBlock>("eth_getBlockByNumber", ["0x" + n.toString(16), true])),
  )

  const senders = new Set<string>()
  for (const block of blocks) {
    for (const tx of block?.transactions ?? []) {
      if (tx?.from) senders.add(tx.from.toLowerCase())
    }
  }
  return senders.size ? senders.size : null
}

export async function GET() {
  const [dex, gasHex, activeAddresses] = await Promise.all([
    fetchDexAggregate(),
    rpcCall<string>("eth_gasPrice", []),
    fetchActiveAddresses(),
  ])

  const gasPriceWei = gasHex ? Number(BigInt(gasHex)) : null
  const gasPriceGwei = gasPriceWei !== null ? gasPriceWei / 1e9 : null

  let gasFeeUsd: number | null = null
  if (gasPriceWei !== null && dex.croPriceUsd !== null) {
    const feeCro = (gasPriceWei * STANDARD_TRANSFER_GAS) / 1e18
    gasFeeUsd = feeCro * dex.croPriceUsd
  }

  const stats: ChainStats = {
    volume24h: dex.volume24h,
    liquidityUsd: dex.liquidityUsd,
    gasFeeUsd,
    gasPriceGwei,
    croPriceUsd: dex.croPriceUsd,
    activeAddresses,
    activeSampleBlocks: ACTIVE_SAMPLE_BLOCKS,
  }

  return NextResponse.json(stats, { headers: { "cache-control": "no-store" } })
}
