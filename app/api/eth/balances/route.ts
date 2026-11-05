import { ethers } from "ethers"
import { ETH_CHAIN_ID, ETH_RPC_URLS, ETH_TOKENS } from "@/lib/eth"
import { FailoverRpcProvider } from "@/lib/rpc-urls"

export const dynamic = "force-dynamic"

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"
const multicall = new ethers.Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
])
const erc20 = new ethers.Interface(["function balanceOf(address account) view returns (uint256)"])

let provider: FailoverRpcProvider | null = null

/** GET /api/eth/balances?address=0x... — ETH and curated ERC-20 balances on Ethereum mainnet, keyed like /api/balances. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")
  if (!address || !ethers.isAddress(address)) return Response.json({ error: "Invalid address" }, { status: 400 })

  try {
    provider ??= new FailoverRpcProvider(ETH_RPC_URLS, ETH_CHAIN_ID)
    const calls = ETH_TOKENS.map((t) =>
      t.isNative
        ? { target: MULTICALL3, allowFailure: true, callData: multicall.encodeFunctionData("getEthBalance", [address]) }
        : { target: t.address, allowFailure: true, callData: erc20.encodeFunctionData("balanceOf", [address]) },
    )
    const raw = await provider.call({ to: MULTICALL3, data: multicall.encodeFunctionData("aggregate3", [calls]) })
    const [results] = multicall.decodeFunctionResult("aggregate3", raw) as unknown as [{ success: boolean; returnData: string }[]]

    const balances: Record<string, string> = {}
    ETH_TOKENS.forEach((t, i) => {
      const r = results[i]
      const value = r?.success && r.returnData.length >= 66 ? BigInt(r.returnData.slice(0, 66)) : BigInt(0)
      balances[t.isNative ? "native" : t.address.toLowerCase()] = ethers.formatUnits(value, t.decimals)
    })
    return Response.json({ balances })
  } catch {
    return Response.json({ error: "Could not load Ethereum balances" }, { status: 502 })
  }
}
