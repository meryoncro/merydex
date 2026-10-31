import "server-only"
import { JsonRpcProvider } from "ethers"

export function provider(): JsonRpcProvider {
  return new JsonRpcProvider(process.env.RPC_URL || "https://evm.cronos.org", 25, { staticNetwork: true })
}
