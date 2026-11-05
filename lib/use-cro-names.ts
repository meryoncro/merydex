"use client"

import { useCallback } from "react"
import useSWR from "swr"

const MAX_PER_REQUEST = 60

const fetchNames = async (url: string): Promise<Record<string, string | null>> => {
  const res = await fetch(url)
  if (!res.ok) return {}
  const json = (await res.json()) as { names?: Record<string, string | null> }
  return json.names ?? {}
}

export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * Looks up verified Cronos ID (.cro) names for the given wallets and returns a
 * `label(address)` function that falls back to the short 0x address.
 */
export function useCroNames(addresses: ReadonlyArray<string | null | undefined>) {
  const list = [...new Set(addresses.filter((a): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a)).map((a) => a.toLowerCase()))]
    .sort()
    .slice(0, MAX_PER_REQUEST)
  const key = list.length > 0 ? `/api/names?addresses=${list.join(",")}` : null

  const { data } = useSWR(key, fetchNames, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60 * 1000,
    keepPreviousData: true,
  })

  const nameOf = useCallback((address: string | null | undefined) => (address ? data?.[address.toLowerCase()] ?? null : null), [data])
  const label = useCallback((address: string) => nameOf(address) ?? shortAddress(address), [nameOf])

  return { nameOf, label }
}
