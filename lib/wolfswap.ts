import "server-only"
import { FEE_BPS, FEE_COLLECTOR } from "@/lib/fees"

const CRONOS_NETWORK_ID = 25

function baseUrl(): string {
  const raw = process.env.BASE_URL
  const key = process.env.WOLFSWAP_API_KEY
  if (!raw || !key) throw new Error("Swap routing is not configured on the server.")
  const trimmed = raw.replace(/\/+$/, "")
  return trimmed.endsWith("/v2") ? trimmed : `${trimmed}/v2`
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WOLFSWAP_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `Routing request failed (${res.status})`)
  return data as T
}

export async function quoteExactIn(srcToken: string, dstToken: string, amountWei: bigint) {
  const quotes = await call<{ quoteId?: string; amountOutTotal?: string }[]>("/quote", {
    networkId: CRONOS_NETWORK_ID,
    srcToken,
    dstToken,
    exactIn: true,
    amount: amountWei.toString(),
  })
  const best = Array.isArray(quotes) ? quotes[0] : undefined
  if (!best?.quoteId || !best.amountOutTotal || BigInt(best.amountOutTotal) <= BigInt(0)) {
    throw new Error("No route for this pair right now")
  }
  return { quoteId: best.quoteId, amountOutTotal: BigInt(best.amountOutTotal) }
}

/** `recipient` receives the swap output; the partner fee is applied on top of `slippageBps`. */
export async function buildSwap(quoteId: string, recipient: string, slippageBps: number) {
  const data = await call<{ address?: string; calldata?: string }>("/execute", {
    quoteId,
    to: recipient,
    slippage: Math.min(5000, Math.round(slippageBps) + FEE_BPS),
    deadline: Math.floor(Date.now() / 1000) + 20 * 60,
    feeCollector: FEE_COLLECTOR,
    feeAmount: String(FEE_BPS),
  })
  if (!data?.address || !data?.calldata) throw new Error("Failed to build swap transaction")
  return { router: data.address, calldata: data.calldata }
}
