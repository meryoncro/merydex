import { NextResponse } from "next/server"
import { ethers } from "ethers"
import { FEE_BPS } from "@/lib/fees"

export const dynamic = "force-dynamic"

const CRONOS_NETWORK_ID = 25

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function wolfswapBaseUrl(): string | null {
  const raw = process.env.BASE_URL
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, "")
  return trimmed.endsWith("/v2") ? trimmed : `${trimmed}/v2`
}

type WolfSplitPart = { name?: string }
type WolfSplit = { parts?: WolfSplitPart[] }
type WolfQuote = {
  amountInTotal?: string
  amountOutTotal?: string
  exactIn?: boolean
  labels?: { v2?: boolean; v3?: boolean; splits?: boolean }
  splits?: WolfSplit[]
  quoteId?: string
}

/**
 * Ask the WolfSwap aggregator for the best route. Returns null when the
 * aggregator is unavailable (missing key, network error, no route) so the
 * caller can fall back to the VVS router.
 */
async function getWolfswapQuote(
  from: string,
  to: string,
  amountInWei: bigint,
  outDec: number,
  signal: AbortSignal,
): Promise<{
  amountOut: string
  route: string[]
  quoteId: string | null
  source: "wolfswap"
} | null> {
  const base = wolfswapBaseUrl()
  const key = process.env.WOLFSWAP_API_KEY
  if (!base || !key) return null

  try {
    const res = await fetch(`${base}/quote`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        networkId: CRONOS_NETWORK_ID,
        srcToken: from,
        dstToken: to,
        exactIn: true,
        amount: amountInWei.toString(),
      }),
      signal,
      cache: "no-store",
    })

    if (!res.ok) return null
    const quotes = (await res.json()) as WolfQuote[]
    if (!Array.isArray(quotes) || quotes.length === 0) return null

    const best = quotes[0]
    if (!best?.amountOutTotal || BigInt(best.amountOutTotal) <= BigInt(0)) return null

    // Collect friendly DEX names from the winning route's splits.
    const names = new Set<string>()
    for (const split of best.splits ?? []) {
      for (const part of split.parts ?? []) {
        if (part?.name) names.add(part.name)
      }
    }
    if (names.size === 0) {
      if (best.labels?.v3) names.add("Uniswap V3")
      else if (best.labels?.v2) names.add("Uniswap V2")
    }

    // Show what the trader actually receives after the MCRO.FUN partner fee.
    const netOut = (BigInt(best.amountOutTotal) * BigInt(10000 - FEE_BPS)) / BigInt(10000)
    return {
      amountOut: ethers.formatUnits(netOut, outDec),
      route: Array.from(names),
      quoteId: best.quoteId ?? null,
      source: "wolfswap",
    }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { fromAddress, toAddress, fromDecimals, toDecimals, amountIn, nativeIn, nativeOut } = body ?? {}

    if (!isAddress(fromAddress) || !isAddress(toAddress)) {
      return NextResponse.json({ error: "Invalid token address" }, { status: 400 })
    }
    if (fromAddress.toLowerCase() === toAddress.toLowerCase()) {
      return NextResponse.json({ error: "Cannot swap the same token" }, { status: 400 })
    }
    const inDec = Number(fromDecimals)
    const outDec = Number(toDecimals)
    if (!Number.isInteger(inDec) || !Number.isInteger(outDec) || inDec < 0 || outDec < 0) {
      return NextResponse.json({ error: "Invalid decimals" }, { status: 400 })
    }
    if (!amountIn || isNaN(Number(amountIn)) || Number(amountIn) <= 0) {
      return NextResponse.json({ error: "Invalid input amount" }, { status: 400 })
    }

    const from = ethers.getAddress(fromAddress)
    const to = ethers.getAddress(toAddress)
    const amountInWei = ethers.parseUnits(String(amountIn), inDec)

    // Native CRO pairs arrive here already mapped to WCRO; the client wraps CRO
    // before the swap and unwraps WCRO after it. All swaps route through
    // WolfSwap only, so every trade carries the MCRO.FUN partner fee.
    const result = await getWolfswapQuote(from, to, amountInWei, outDec, request.signal)

    if (!result) {
      return NextResponse.json({ error: "No route for this pair" }, { status: 404 })
    }

    return NextResponse.json(
      {
        amountOut: result.amountOut,
        route: result.route,
        quoteId: result.quoteId,
        source: result.source,
        quoteTime: Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quote failed" },
      { status: 500 },
    )
  }
}
