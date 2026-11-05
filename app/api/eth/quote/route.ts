import { formatUnits, parseUnits } from "ethers"
import { ETH_CHAIN_ID, findEthToken } from "@/lib/eth"
import { MAX_SLIPPAGE } from "@/lib/chains"
import { UNISWAP_FEE_BPS, UNISWAP_FEE_RECIPIENT, errorResponse, isAddress, uniswap } from "@/lib/uniswap"

export const dynamic = "force-dynamic"

type AggregatedOutput = { amount: string; minAmount?: string; recipient: string; fee?: string }
type QuoteResponse = {
  routing: string
  permitData: unknown
  quote: {
    output: { amount: string; minimumAmount?: string }
    aggregatedOutputs?: AggregatedOutput[]
    gasFeeUSD?: string | number
    priceImpact?: number
    routeString?: string
  }
}

/**
 * POST /api/eth/quote { tokenIn, tokenOut, amount, swapper?, slippage? }
 * Quotes an exact-input Ethereum swap on Uniswap v2/v3/v4 with the platform fee attached.
 * The raw quote is returned so the client can pass it back to /api/eth/swap unchanged.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const tokenIn = findEthToken(body?.tokenIn)
    const tokenOut = findEthToken(body?.tokenOut)
    if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) {
      return Response.json({ error: "Unsupported token pair." }, { status: 400 })
    }
    if (typeof body?.amount !== "string" || !/^\d*\.?\d+$/.test(body.amount)) {
      return Response.json({ error: "Invalid amount." }, { status: 400 })
    }
    const amountRaw = parseUnits(body.amount, tokenIn.decimals)
    if (amountRaw <= BigInt(0)) return Response.json({ error: "Invalid amount." }, { status: 400 })

    const slippage = Math.min(Math.max(Number(body?.slippage) || 0.5, 0.05), MAX_SLIPPAGE)
    // Quotes need a swapper; before a wallet connects, the fee wallet stands in for price discovery only.
    const swapper = isAddress(body?.swapper) ? body.swapper : UNISWAP_FEE_RECIPIENT

    const data = await uniswap<QuoteResponse>("/quote", {
      type: "EXACT_INPUT",
      amount: amountRaw.toString(),
      tokenInChainId: ETH_CHAIN_ID,
      tokenOutChainId: ETH_CHAIN_ID,
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      swapper,
      slippageTolerance: slippage,
      routingPreference: "BEST_PRICE",
      protocols: ["V2", "V3", "V4"],
      integratorFees: [{ bips: UNISWAP_FEE_BPS, recipient: UNISWAP_FEE_RECIPIENT }],
    })

    if (data.routing !== "CLASSIC") return Response.json({ error: "No route right now." }, { status: 404 })

    const outputs = data.quote.aggregatedOutputs ?? []
    const userOutput = outputs.find((o) => !o.fee)
    const feeOutput = outputs.find((o) => o.fee === "INTEGRATOR")
    const net = userOutput?.amount ?? data.quote.output.amount
    const min = userOutput?.minAmount ?? data.quote.output.minimumAmount ?? net

    return Response.json({
      amountOut: formatUnits(net, tokenOut.decimals),
      minAmountOut: formatUnits(min, tokenOut.decimals),
      feeAmount: feeOutput ? formatUnits(feeOutput.amount, tokenOut.decimals) : null,
      feeBps: UNISWAP_FEE_BPS,
      gasFeeUSD: data.quote.gasFeeUSD != null ? Number(data.quote.gasFeeUSD) : null,
      priceImpact: data.quote.priceImpact ?? null,
      route: data.quote.routeString ?? null,
      needsPermit: Boolean(data.permitData),
      quote: data.quote,
      permitData: data.permitData ?? null,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
