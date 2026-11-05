import { ETH_CHAIN_ID } from "@/lib/eth"
import { UNISWAP_FEE_BPS, UNISWAP_FEE_RECIPIENT, errorResponse, uniswap } from "@/lib/uniswap"

export const dynamic = "force-dynamic"

type Quote = { chainId?: number; aggregatedOutputs?: { recipient?: string; bps?: number; fee?: string }[] }
type SwapTx = { to: string; data: string; value: string; chainId: number; gasLimit?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string }

/**
 * POST /api/eth/swap { quote, signature?, permitData? }
 * Turns a quote from /api/eth/quote into a ready-to-sign Universal Router transaction.
 * Quotes without the platform fee are rejected so the API key can't be used fee-free.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const quote = body?.quote as Quote | undefined
    if (!quote || typeof quote !== "object" || quote.chainId !== ETH_CHAIN_ID) {
      return Response.json({ error: "Invalid quote." }, { status: 400 })
    }
    const hasFee = quote.aggregatedOutputs?.some(
      (o) => o.fee === "INTEGRATOR" && o.bps === UNISWAP_FEE_BPS && o.recipient?.toLowerCase() === UNISWAP_FEE_RECIPIENT.toLowerCase(),
    )
    if (!hasFee) return Response.json({ error: "Quote is missing the platform fee." }, { status: 400 })

    const payload: Record<string, unknown> = { quote, simulateTransaction: false }
    if (body.permitData) {
      if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.signature)) {
        return Response.json({ error: "Missing permit signature." }, { status: 400 })
      }
      payload.permitData = body.permitData
      payload.signature = body.signature
    }

    const data = await uniswap<{ swap: SwapTx }>("/swap", payload)
    const tx = data.swap
    if (!tx?.to || !tx.data || tx.data === "0x" || tx.chainId !== ETH_CHAIN_ID) {
      return Response.json({ error: "Uniswap returned an invalid transaction. Try again." }, { status: 502 })
    }
    return Response.json({ swap: tx })
  } catch (error) {
    return errorResponse(error)
  }
}
