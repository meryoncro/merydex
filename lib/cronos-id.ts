import "server-only"
import { Contract, Interface, ZeroAddress, getAddress, namehash } from "ethers"
import { provider } from "@/lib/rpc"

// Cronos ID (.cro names) is an ENS fork. Reverse records live under
// <address>.addr.reverse; we only show a name when it also resolves forward to
// the same address, otherwise anyone could set their reverse record to "mery.cro".
const CRONOS_ID_REGISTRY = "0x7F4C61116729d5b27E5f180062Fdfbf32E9283E5"
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"

const registryIface = new Interface(["function resolver(bytes32 node) view returns (address)"])
const resolverIface = new Interface([
  "function name(bytes32 node) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
])
const multicallAbi = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
]

const NAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.cro$/
const FOUND_TTL_MS = 60 * 60 * 1000
const MISSING_TTL_MS = 10 * 60 * 1000
export const MAX_NAME_LOOKUPS = 60

const cache = new Map<string, { name: string | null; expires: number }>()

type Call = { target: string; allowFailure: boolean; callData: string }
type CallResult = { success: boolean; returnData: string }

async function aggregate(calls: Call[]): Promise<CallResult[]> {
  if (calls.length === 0) return []
  const multicall = new Contract(MULTICALL3, multicallAbi, provider())
  return (await multicall.aggregate3.staticCall(calls)) as CallResult[]
}

function decode<T>(iface: Interface, fn: string, result: CallResult | undefined): T | null {
  if (!result?.success || result.returnData === "0x") return null
  try {
    return iface.decodeFunctionResult(fn, result.returnData)[0] as T
  } catch {
    return null
  }
}

function safeNamehash(name: string): string | null {
  try {
    return namehash(name)
  } catch {
    return null
  }
}

async function lookup(addresses: string[]): Promise<Record<string, string | null>> {
  const reverseNodes = addresses.map((a) => namehash(`${a.slice(2)}.addr.reverse`))

  const reverseResolvers = (
    await aggregate(reverseNodes.map((node) => ({ target: CRONOS_ID_REGISTRY, allowFailure: true, callData: registryIface.encodeFunctionData("resolver", [node]) })))
  ).map((r) => decode<string>(registryIface, "resolver", r))

  const nameIndexes = addresses.map((_, i) => i).filter((i) => reverseResolvers[i] && reverseResolvers[i] !== ZeroAddress)
  const nameResults = await aggregate(
    nameIndexes.map((i) => ({ target: reverseResolvers[i]!, allowFailure: true, callData: resolverIface.encodeFunctionData("name", [reverseNodes[i]]) })),
  )

  const candidates: { index: number; name: string; node: string }[] = []
  nameIndexes.forEach((index, n) => {
    const name = decode<string>(resolverIface, "name", nameResults[n])?.trim().toLowerCase()
    if (!name || name.length > 64 || !NAME_PATTERN.test(name)) return
    const node = safeNamehash(name)
    if (node) candidates.push({ index, name, node })
  })

  const forwardResolvers = (
    await aggregate(candidates.map((c) => ({ target: CRONOS_ID_REGISTRY, allowFailure: true, callData: registryIface.encodeFunctionData("resolver", [c.node]) })))
  ).map((r) => decode<string>(registryIface, "resolver", r))

  const verifiable = candidates.filter((_, n) => forwardResolvers[n] && forwardResolvers[n] !== ZeroAddress)
  const verifiableResolvers = forwardResolvers.filter((r) => r && r !== ZeroAddress) as string[]
  const forwardAddrs = await aggregate(
    verifiable.map((c, n) => ({ target: verifiableResolvers[n], allowFailure: true, callData: resolverIface.encodeFunctionData("addr", [c.node]) })),
  )

  const names: Record<string, string | null> = Object.fromEntries(addresses.map((a) => [a, null]))
  verifiable.forEach((c, n) => {
    const resolved = decode<string>(resolverIface, "addr", forwardAddrs[n])
    if (resolved && resolved.toLowerCase() === addresses[c.index]) names[addresses[c.index]] = c.name
  })
  return names
}

/** Resolve verified .cro names for up to MAX_NAME_LOOKUPS addresses. Keys are lowercase addresses. */
export async function resolveCroNames(input: string[]): Promise<Record<string, string | null>> {
  const now = Date.now()
  const unique = [...new Set(input.map((a) => a.toLowerCase()).filter((a) => /^0x[0-9a-f]{40}$/.test(a)))].slice(0, MAX_NAME_LOOKUPS)
  const result: Record<string, string | null> = {}
  const pending: string[] = []

  for (const address of unique) {
    const hit = cache.get(address)
    if (hit && hit.expires > now) result[address] = hit.name
    else pending.push(address)
  }

  if (pending.length > 0) {
    try {
      const fresh = await lookup(pending.map((a) => getAddress(a).toLowerCase()))
      for (const [address, name] of Object.entries(fresh)) {
        cache.set(address, { name, expires: now + (name ? FOUND_TTL_MS : MISSING_TTL_MS) })
        result[address] = name
      }
    } catch {
      for (const address of pending) result[address] = null
    }
  }

  return result
}
