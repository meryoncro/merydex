import { NextResponse } from "next/server"
import { MAX_NAME_LOOKUPS, resolveCroNames } from "@/lib/cronos-id"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("addresses") ?? ""
  const addresses = raw
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a))

  if (addresses.length === 0) return NextResponse.json({ names: {} })
  if (addresses.length > MAX_NAME_LOOKUPS) {
    return NextResponse.json({ error: `At most ${MAX_NAME_LOOKUPS} addresses per request` }, { status: 400 })
  }

  const names = await resolveCroNames(addresses)
  return NextResponse.json({ names }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } })
}
