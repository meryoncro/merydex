import { parseUnits } from "ethers"
import { ETH_CHAIN_ID, findEthToken } from "@/lib/eth"
import { errorResponse, isAddress, uniswap } from "@/lib/uniswap"

export const dynamic = "force-dynamic"

type Tx = { to: string; data: string; value?: string; gasLimit?: string }

/**
 * POST /api/eth/approval { walletAddress, token, amount }
 * Returns the Permit2 approval transaction the wallet still needs (if any), plus a
 * reset-to-zero transaction for tokens like USDT that require it first.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const token = findEthToken(body?.token)
    if (!isAddress(body?.walletAddress) || !token) return Response.json({ error: "Invalid request." }, { status: 400 })
    if (token.isNative) return Response.json({ approval: null, cancel: null })
    if (typeof body?.amount !== "string" || !/^\d*\.?\d+$/.test(body.amount)) {
      return Response.json({ error: "Invalid amount." }, { status: 400 })
    }

    const data = await uniswap<{ approval: Tx | null; cancel: Tx | null }>("/check_approval", {
      walletAddress: body.walletAddress,
      token: token.address,
      amount: parseUnits(body.amount, token.decimals).toString(),
      chainId: ETH_CHAIN_ID,
    })
    return Response.json({ approval: data.approval ?? null, cancel: data.cancel ?? null })
  } catch (error) {
    return errorResponse(error)
  }
}
