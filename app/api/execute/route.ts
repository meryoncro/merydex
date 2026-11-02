import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function wolfswapBaseUrl(): string | null {
  const raw = process.env.BASE_URL
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, "")
  return trimmed.endsWith("/v2") ? trimmed : `${trimmed}/v2`
}

import { ethers } from "ethers"
import { FEE_BPS, FEE_COLLECTOR } from "@/lib/fees"
import { prepareObsidianSwap } from "@/lib/obsidian"

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
}

/**
 * Turns a WolfSwap quoteId into signable transaction calldata. The aggregator
 * only returns { address, calldata } — it never broadcasts. The browser wallet
 * signs and sends the returned calldata.
 */
async function executeObsidian(body: Record<string, unknown>) {
  const { fromAddress, toAddress, fromDecimals, amountIn, nativeIn, nativeOut, to, slippageBps } = body
  if (!isAddress(fromAddress) || !isAddress(toAddress) || !isAddress(to)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  }
  const inDec = Number(fromDecimals)
  const bps = Number(slippageBps)
  if (!Number.isInteger(inDec) || inDec < 0 || inDec > 36) {
    return NextResponse.json({ error: "Invalid decimals" }, { status: 400 })
  }
  if (!Number.isFinite(bps) || bps < 1 || bps > 5000) {
    return NextResponse.json({ error: "Invalid slippage" }, { status: 400 })
  }
  if (typeof amountIn !== "string" || !(Number(amountIn) > 0)) {
    return NextResponse.json({ error: "Invalid input amount" }, { status: 400 })
  }

  const prepared = await prepareObsidianSwap(
    {
      from: ethers.getAddress(fromAddress),
      to: ethers.getAddress(toAddress),
      amountInWei: ethers.parseUnits(amountIn, inDec),
      nativeIn: Boolean(nativeIn),
      nativeOut: Boolean(nativeOut),
    },
    ethers.getAddress(to),
    bps,
  )
  return NextResponse.json(
    {
      address: prepared.address,
      calldata: prepared.calldata,
      value: prepared.value,
      gasLimit: prepared.gasLimit,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: Request) {
  try {
    const parsed = await request.clone().json().catch(() => null)
    if (parsed?.source === "obsidian") return await executeObsidian(parsed)

    const base = wolfswapBaseUrl()
    const key = process.env.WOLFSWAP_API_KEY
    if (!base || !key) {
      return NextResponse.json(
        { error: "Swap execution is not configured on the server." },
        { status: 503 },
      )
    }

    const body = await request.json()
    const { quoteId, to, slippageBps } = body ?? {}

    if (typeof quoteId !== "string" || quoteId.length === 0) {
      return NextResponse.json({ error: "Missing quoteId" }, { status: 400 })
    }
    if (!isAddress(to)) {
      return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 })
    }
    const bps = Number(slippageBps)
    if (!Number.isFinite(bps) || bps < 0 || bps > 5000) {
      return NextResponse.json({ error: "Invalid slippage" }, { status: 400 })
    }

    const res = await fetch(`${base}/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quoteId,
        to,
        // WolfSwap's quote excludes the partner fee, so its min-out is computed off
        // the gross output. Widen tolerance by the fee so the net output passes.
        slippage: Math.min(5000, Math.round(bps) + FEE_BPS),
        deadline: Math.floor(Date.now() / 1000) + 20 * 60,
        feeCollector: FEE_COLLECTOR,
        feeAmount: String(FEE_BPS),
      }),
      cache: "no-store",
    })

    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.address || !data?.calldata) {
      const msg = data?.error ?? "Failed to build swap transaction"
      return NextResponse.json({ error: msg }, { status: res.ok ? 502 : res.status })
    }

    return NextResponse.json(
      { address: data.address, calldata: data.calldata },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Execute failed" },
      { status: 500 },
    )
  }
}
