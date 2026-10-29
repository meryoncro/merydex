import { Contract, formatUnits, getAddress, type JsonRpcProvider, type TransactionReceipt } from "ethers"
import { TOKENS, getTokenBySymbol } from "@/lib/tokens"
import { STABLE_SYMBOLS } from "@/lib/dexscan"

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const WITHDRAW_SELECTOR = "0x2e1a7d4d"
const MIN_POOL_LIQUIDITY_USD = 10_000
const MAX_TRADE_USD = 10_000_000
const WCRO = getTokenBySymbol("WCRO")!.address.toLowerCase()

interface DexPair {
  chainId?: string
  baseToken?: { address?: string }
  quoteToken?: { address?: string }
  priceUsd?: string
  priceNative?: string
  liquidity?: { usd?: number }
}

/**
 * USD price from the deepest Cronos pool. Thin pools are ignored so a wallet
 * can't pump a dust pool and claim a huge leaderboard volume.
 */
async function priceUsd(address: string): Promise<number | null> {
  const known = TOKENS.find((t) => t.address.toLowerCase() === address)
  if (known && STABLE_SYMBOLS.has(known.symbol.toUpperCase())) return 1

  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  }).catch(() => null)
  if (!res?.ok) return null
  const data = (await res.json().catch(() => null)) as { pairs?: DexPair[] } | null

  const pools = (data?.pairs ?? [])
    .filter((p) => p.chainId === "cronos" && (p.liquidity?.usd ?? 0) >= MIN_POOL_LIQUIDITY_USD)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))

  for (const p of pools) {
    const usd = Number(p.priceUsd)
    if (p.baseToken?.address?.toLowerCase() === address && usd > 0) return usd
    const native = Number(p.priceNative)
    if (p.quoteToken?.address?.toLowerCase() === address && usd > 0 && native > 0) return usd / native
  }
  return null
}

async function decimalsOf(rpc: JsonRpcProvider, address: string): Promise<number | null> {
  const known = TOKENS.find((t) => t.address.toLowerCase() === address)
  if (known) return known.decimals
  const value = await new Contract(address, ["function decimals() view returns (uint8)"], rpc)
    .decimals()
    .catch(() => null)
  return value == null ? null : Number(value)
}

export type TradeCheck =
  | { ok: false; reason: string }
  | { ok: true; amountIn: string | null; usdValue: number | null; inputToken: string | null }

/**
 * Derives what the wallet actually spent from the transaction itself, never
 * from client input. Self-transfers and plain sends are rejected so wallets
 * can't farm leaderboard volume for the cost of gas.
 */
export async function valueTrade(
  rpc: JsonRpcProvider,
  receipt: TransactionReceipt,
  wallet: string,
  claimedInput: string | null,
): Promise<TradeCheck> {
  const tx = await rpc.getTransaction(receipt.hash).catch(() => null)
  if (!tx || !tx.to) return { ok: false, reason: "not_a_swap" }

  const target = tx.to.toLowerCase()
  if (target === wallet) return { ok: false, reason: "self_transfer" }
  const code = await rpc.getCode(target).catch(() => "0x")
  if (code === "0x") return { ok: false, reason: "not_a_contract" }

  let token: string | null = null
  let raw: bigint | null = null

  if (tx.value > BigInt(0)) {
    token = WCRO
    raw = tx.value
  } else if (target === WCRO && tx.data.startsWith(WITHDRAW_SELECTOR) && tx.data.length >= 74) {
    token = WCRO
    raw = BigInt("0x" + tx.data.slice(10, 74))
  } else {
    const fromTopic = "0x" + wallet.slice(2).padStart(64, "0")
    const spends = receipt.logs.filter(
      (l) => l.topics[0] === TRANSFER_TOPIC && l.topics.length === 3 && l.topics[1]?.toLowerCase() === fromTopic,
    )
    const chosen = spends.find((l) => l.address.toLowerCase() === claimedInput) ?? spends[0]
    if (!chosen) return { ok: false, reason: "no_input_leg" }
    token = chosen.address.toLowerCase()
    raw = BigInt(chosen.data)
  }

  const decimals = await decimalsOf(rpc, token)
  if (decimals == null || raw == null) return { ok: true, amountIn: null, usdValue: null, inputToken: getAddress(token) }

  const amount = Number(formatUnits(raw, decimals))
  const price = await priceUsd(token)
  const usd = price != null ? amount * price : null
  const usdValue = usd != null && Number.isFinite(usd) && usd >= 0 ? Math.min(usd, MAX_TRADE_USD) : null

  return { ok: true, amountIn: formatUnits(raw, decimals), usdValue, inputToken: getAddress(token) }
}
