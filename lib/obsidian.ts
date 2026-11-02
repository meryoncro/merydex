import "server-only"
import { FEE_COLLECTOR, OBSIDIAN_FEE_BPS } from "@/lib/fees"

const API = "https://api.obsidian.finance"
const CHAIN_ID = 25
const NATIVE = "0x0000000000000000000000000000000000000000"
const TOKEN_LIST_TTL_MS = 10 * 60 * 1000

type ObsidianToken = { address: string; decimals: number; symbol: string; name: string; chainId: number }
type Currency = { chainId: number; address: string; decimals: number; symbol: string; name: string }

export type ObsidianQuote = {
  outputAmount?: { value?: string }
  quoteContext?: { timestamp?: number }
  partnerFee?: { recipient?: string; basisPoints?: number }
  execution?: { settlementAddress?: string | null; approvalSpender?: string | null }
  tax?: { totalTaxBps?: number }
  routes?: { path?: { symbol?: string }[] }[]
}

type Prepared = {
  chainId?: number
  recipient?: string
  partnerFee?: { recipient?: string; basisPoints?: number }
  transaction?: { to?: string; data?: string; value?: string; gasLimit?: string; from?: string; chainId?: number }
}

export type ObsidianPair = {
  from: string
  to: string
  amountInWei: bigint
  nativeIn: boolean
  nativeOut: boolean
}

let tokenCache: { at: number; byAddress: Map<string, ObsidianToken> } | null = null

async function getTokenList(signal?: AbortSignal): Promise<Map<string, ObsidianToken>> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_LIST_TTL_MS) return tokenCache.byAddress
  const res = await fetch(`${API}/${CHAIN_ID}/v1/whitelisted-tokens`, { signal, cache: "no-store" })
  if (!res.ok) throw new Error(`Obsidian token list failed (${res.status})`)
  const { tokens } = (await res.json()) as { tokens?: ObsidianToken[] }
  const byAddress = new Map<string, ObsidianToken>()
  for (const token of tokens ?? []) {
    if (token.chainId === CHAIN_ID) byAddress.set(token.address.toLowerCase(), token)
  }
  tokenCache = { at: Date.now(), byAddress }
  return byAddress
}

function partnerFee() {
  return { recipient: FEE_COLLECTOR, basisPoints: OBSIDIAN_FEE_BPS }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message || data?.error || `Obsidian request failed (${res.status})`)
  return data as T
}

async function resolveCurrency(address: string, native: boolean, signal?: AbortSignal): Promise<Currency | null> {
  const list = await getTokenList(signal)
  const token = list.get((native ? NATIVE : address).toLowerCase())
  if (!token) return null
  return { chainId: CHAIN_ID, address: token.address, decimals: token.decimals, symbol: token.symbol, name: token.name }
}

/**
 * Exact-input quote with the MCRO.FUN partner fee attached. `netOut` already has
 * Obsidian's 0.4% and our partner fee deducted. Returns null when Obsidian cannot
 * route the pair (unlisted token, transfer-tax token, no liquidity, API down).
 */
export async function getObsidianQuote(pair: ObsidianPair, signal?: AbortSignal) {
  try {
    const [input, output] = await Promise.all([
      resolveCurrency(pair.from, pair.nativeIn, signal),
      resolveCurrency(pair.to, pair.nativeOut, signal),
    ])
    if (!input || !output || input.address.toLowerCase() === output.address.toLowerCase()) return null

    const quote = await post<ObsidianQuote>(
      `/${CHAIN_ID}/v1/getquote`,
      {
        chainId: CHAIN_ID,
        tradeType: 0,
        amount: { currency: input, value: pair.amountInWei.toString() },
        currency: output,
        poolTypes: [0, 1],
        venueScope: "all",
        maxHops: 4,
        maxSplits: 3,
        partnerFee: partnerFee(),
      },
      signal,
    )

    const netOut = BigInt(quote.outputAmount?.value ?? "0")
    if (netOut <= BigInt(0)) return null
    // Partner-fee settlement does not support transfer-tax tokens.
    if ((quote.tax?.totalTaxBps ?? 0) > 0) return null
    if (quote.partnerFee?.recipient?.toLowerCase() !== FEE_COLLECTOR.toLowerCase()) return null
    if (quote.partnerFee?.basisPoints !== OBSIDIAN_FEE_BPS) return null
    const settlement = quote.execution?.settlementAddress
    if (!settlement) return null

    return {
      netOut,
      quote,
      settlement,
      approvalSpender: pair.nativeIn ? null : quote.execution?.approvalSpender || settlement,
    }
  } catch {
    return null
  }
}

/**
 * Fresh quote + preparation in one server round-trip, so the quote stays inside
 * Obsidian's 30-second partner-fee window. The caller must have approved the
 * settlement contract already; preparation simulates from `user`.
 */
export async function prepareObsidianSwap(pair: ObsidianPair, user: string, slippageBps: number) {
  const fresh = await getObsidianQuote(pair)
  if (!fresh) throw new Error("Obsidian has no route for this pair right now")

  const prepared = await post<Prepared>("/v1/getswap", {
    chainId: CHAIN_ID,
    userAddress: user,
    quote: fresh.quote,
    partnerFee: partnerFee(),
    options: {
      recipient: user,
      slippageTolerance: { numerator: String(Math.round(slippageBps)), denominator: "10000" },
      deadlineOrPreviousBlockhash: String(Math.floor(Date.now() / 1000) + 600),
    },
  })

  const tx = prepared.transaction
  const expectedValue = pair.nativeIn ? pair.amountInWei : BigInt(0)
  if (
    !tx?.to ||
    !tx.data ||
    prepared.chainId !== CHAIN_ID ||
    tx.to.toLowerCase() !== fresh.settlement.toLowerCase() ||
    prepared.recipient?.toLowerCase() !== user.toLowerCase() ||
    BigInt(tx.value ?? "0") !== expectedValue ||
    prepared.partnerFee?.recipient?.toLowerCase() !== FEE_COLLECTOR.toLowerCase() ||
    prepared.partnerFee?.basisPoints !== OBSIDIAN_FEE_BPS
  ) {
    throw new Error("Prepared Obsidian transaction did not match this swap")
  }

  return {
    address: tx.to,
    calldata: tx.data,
    value: expectedValue.toString(),
    gasLimit: tx.gasLimit ?? null,
    expectedOut: fresh.netOut,
  }
}
