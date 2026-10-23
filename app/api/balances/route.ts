import { NextResponse } from "next/server"
import { ethers } from "ethers"
import { TOKENS } from "@/lib/tokens"

export const dynamic = "force-dynamic"

const ERC20_BALANCE_ABI = ["function balanceOf(address account) external view returns (uint256)"]

/**
 * GET /api/balances?address=0x...
 *
 * Reads the connected wallet's on-chain balances for native CRO and every
 * token in the Cronos registry, straight from the RPC node. Returns a map
 * keyed by lowercase token address (plus "native" for CRO) with the balance
 * as a decimal string. Zero balances are included so the client can decide
 * what to show.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address")

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Valid address required" }, { status: 400 })
  }

  const rpcUrl = process.env.RPC_URL
  if (!rpcUrl) {
    return NextResponse.json({ error: "RPC not configured" }, { status: 500 })
  }

  try {
    // Cronos public RPC rejects JSON-RPC batch payloads, which makes ethers'
    // default auto-batching fail every call at once. Force one request per call
    // and pin the network so no extra chainId probe is batched in.
    const provider = new ethers.JsonRpcProvider(rpcUrl, 25, { batchMaxCount: 1, staticNetwork: true })
    const balances: Record<string, string> = {}

    const results = await Promise.allSettled([
      provider.getBalance(address).then((wei) => ["native", ethers.formatUnits(wei, 18)] as const),
      ...TOKENS.filter((token) => !token.isNative).map(async (token) => {
        const contract = new ethers.Contract(token.address, ERC20_BALANCE_ABI, provider)
        const raw: bigint = await contract.balanceOf(address)
        return [token.address.toLowerCase(), ethers.formatUnits(raw, token.decimals)] as const
      }),
    ])

    for (const result of results) {
      if (result.status === "fulfilled") {
        const [key, value] = result.value
        balances[key] = value
      }
    }

    return NextResponse.json(
      { balances },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.log("[v0] balances route error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 502 })
  }
}
