import { NextResponse } from "next/server"
import { ethers } from "ethers"
import { TOKENS } from "@/lib/tokens"
import { getImportedTokens } from "@/lib/tokenlist"
import { cronosProvider } from "@/lib/rpc-urls"

export const dynamic = "force-dynamic"

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"
const MULTICALL_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
]
const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"]
const CHUNK_SIZE = 400
const MIN_SPLIT = 25

const multicallIface = new ethers.Interface(MULTICALL_ABI)
const erc20Iface = new ethers.Interface(ERC20_ABI)

type Call = { target: string; allowFailure: boolean; callData: string }
type Result = { success: boolean; returnData: string }

// Runs one aggregate3 batch. If the whole batch reverts (e.g. a hostile token
// burns all the gas), split it and retry so one bad contract can't hide every
// other balance.
async function runBatch(provider: ethers.JsonRpcProvider, calls: Call[]): Promise<(Result | null)[]> {
  try {
    const data = multicallIface.encodeFunctionData("aggregate3", [calls])
    const raw = await provider.call({ to: MULTICALL3, data })
    const [decoded] = multicallIface.decodeFunctionResult("aggregate3", raw)
    return (decoded as Result[]).map((r) => ({ success: r.success, returnData: r.returnData }))
  } catch {
    if (calls.length <= MIN_SPLIT) return calls.map(() => null)
    const mid = Math.ceil(calls.length / 2)
    const [a, b] = await Promise.all([runBatch(provider, calls.slice(0, mid)), runBatch(provider, calls.slice(mid))])
    return [...a, ...b]
  }
}

function decodeUint(result: Result | null): bigint | null {
  if (!result?.success || !result.returnData || result.returnData.length < 66) return null
  try {
    return BigInt(result.returnData.slice(0, 66))
  } catch {
    return null
  }
}

/**
 * GET /api/balances?address=0x...
 *
 * Reads the wallet's on-chain balances for native CRO, every curated token and
 * every imported WolfSwap-list token via Multicall3, in a handful of RPC calls.
 * Curated tokens are always returned (zeros included); imported tokens are only
 * returned when the wallet holds them, to keep the payload small. Keys are
 * lowercase token addresses, plus "native" for CRO.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address")

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Valid address required" }, { status: 400 })
  }

  try {
    const provider = cronosProvider(25, process.env.RPC_URL)

    const imported = await getImportedTokens().catch(() => [])
    const curated = TOKENS.filter((t) => !t.isNative)
    const curatedKeys = new Set(curated.map((t) => t.address.toLowerCase()))
    const tokens = [
      ...curated.map((t) => ({ key: t.address.toLowerCase(), decimals: t.decimals, curated: true })),
      ...imported
        .filter((t) => !curatedKeys.has(t.address.toLowerCase()))
        .map((t) => ({ key: t.address.toLowerCase(), decimals: t.decimals, curated: false })),
    ]

    const balanceCall = erc20Iface.encodeFunctionData("balanceOf", [address])
    const calls: Call[] = [
      { target: MULTICALL3, allowFailure: true, callData: multicallIface.encodeFunctionData("getEthBalance", [address]) },
      ...tokens.map((t) => ({ target: t.key, allowFailure: true, callData: balanceCall })),
    ]

    const chunks: Call[][] = []
    for (let i = 0; i < calls.length; i += CHUNK_SIZE) chunks.push(calls.slice(i, i + CHUNK_SIZE))
    const results = (await Promise.all(chunks.map((c) => runBatch(provider, c)))).flat()

    const balances: Record<string, string> = {}
    let native = decodeUint(results[0])
    if (native === null) native = await provider.getBalance(address).catch(() => null)
    if (native !== null) balances.native = ethers.formatUnits(native, 18)

    let missing = 0
    tokens.forEach((t, i) => {
      const raw = decodeUint(results[i + 1])
      if (raw === null) {
        if (t.curated) missing++
        return
      }
      if (t.curated || raw > BigInt(0)) balances[t.key] = ethers.formatUnits(raw, t.decimals)
    })

    if (native === null && Object.keys(balances).length === 0) {
      return NextResponse.json({ error: "Failed to fetch balances" }, { status: 502 })
    }

    return NextResponse.json(
      { balances, checked: tokens.length + 1, missing },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.log("[v0] balances route error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 502 })
  }
}
