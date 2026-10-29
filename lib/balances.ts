// Wallet balance helpers. Fetches on-chain balances for native CRO and every
// registered Cronos token via the server route, then combines them with the
// live market price map to derive USD value.
export type BalanceMap = Record<string, string>

export async function fetchBalances(address: string, signal?: AbortSignal): Promise<BalanceMap> {
  const res = await fetch(`/api/balances?address=${address}`, { signal, cache: "no-store" })
  if (!res.ok) throw new Error("Failed to fetch balances")
  const data = await res.json()
  return (data.balances ?? {}) as BalanceMap
}

// Format a token amount for display: trims to a sensible precision without
// showing misleading trailing zeros, and uses compact notation for large bags.
export function formatBalance(value: string | number | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0
  if (!Number.isFinite(n) || n === 0) return "0"
  if (n > 0 && n < 0.0001) return "<0.0001"
  if (n >= 1_000_000) return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 })
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 })
}
