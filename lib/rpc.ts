import "server-only"
import type { JsonRpcProvider } from "ethers"
import { cronosProvider } from "@/lib/rpc-urls"

export function provider(): JsonRpcProvider {
  return cronosProvider(25, process.env.RPC_URL)
}
