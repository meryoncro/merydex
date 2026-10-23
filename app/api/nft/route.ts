import { NextResponse } from "next/server"
import { ARENA_COLLECTIONS, MERY_COLLECTION, isArenaCollection } from "@/lib/ebisus"

const API = "https://api.ebisusbay.com"

// Small server-side proxy in front of Ebisu's Bay. Keeps the browser off a
// rate-limited third-party origin, normalizes the several "200-with-error"
// legacy quirks into clean shapes, and hides the upstream URL surface.
export const dynamic = "force-dynamic"

async function upstream(path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  })
  // Legacy quirk: some endpoints answer HTTP 400 while still returning a full
  // body. We parse regardless and let callers check the data keys.
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, body: JSON.parse(text) as Record<string, unknown> }
  } catch {
    return { ok: false, status: res.status, body: {} as Record<string, unknown> }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get("action")
  const addr = MERY_COLLECTION

  try {
    if (action === "collection") {
      const { body } = await upstream(`/collections?address=${addr}`)
      const collection = Array.isArray(body.collections) ? body.collections[0] ?? null : null
      return NextResponse.json({ collection })
    }

    if (action === "listings") {
      const page = Number(searchParams.get("page") || "1")
      const sort = searchParams.get("sort") || "price"
      const dir = searchParams.get("dir") || "asc"
      const { body } = await upstream(
        `/listings?collection=${addr}&state=0&sortBy=${sort}&direction=${dir}&page=${page}&pageSize=24`,
      )
      return NextResponse.json({
        listings: Array.isArray(body.listings) ? body.listings : [],
        totalCount: typeof body.totalCount === "number" ? body.totalCount : 0,
        totalPages: typeof body.totalPages === "number" ? body.totalPages : 1,
        page,
      })
    }

    if (action === "wallet") {
      const wallet = searchParams.get("wallet")
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return NextResponse.json({ error: "Valid wallet address required" }, { status: 400 })
      }
      const key = searchParams.get("collection")
      const target = isArenaCollection(key) ? ARENA_COLLECTIONS[key].address : addr
      const { body } = await upstream(`/v2/wallets?wallet=${wallet}&collection=${target}&pageSize=100`)
      return NextResponse.json({ nfts: Array.isArray(body.nfts) ? body.nfts : [] })
    }

    if (action === "validate") {
      const buyer = searchParams.get("address")
      const ids = searchParams.get("listingIds")
      if (!buyer || !/^0x[a-fA-F0-9]{40}$/.test(buyer)) {
        return NextResponse.json({ error: "Valid buyer address required" }, { status: 400 })
      }
      if (!ids) return NextResponse.json({ error: "listingIds required" }, { status: 400 })
      const query = ids
        .split(",")
        .map((id) => `&listingIds[]=${encodeURIComponent(id.trim())}`)
        .join("")
      const res = await fetch(`${API}/api/gasless-listing/validator?address=${buyer}${query}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json(
          { error: (body as { error?: string }).error || "Listing could not be validated" },
          { status: res.status },
        )
      }
      return NextResponse.json(body)
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Ebisu's Bay is unreachable right now" }, { status: 502 })
  }
}
