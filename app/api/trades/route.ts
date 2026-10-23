import { NextResponse } from "next/server"
import { pool } from "@/lib/db"

export const dynamic = "force-dynamic"

const ADDR = /^0x[a-fA-F0-9]{40}$/
const TX = /^0x[a-fA-F0-9]{64}$/

// Record a swap executed through MERYDEX. Deduped on tx_hash so a retry or
// double-submit can't inflate a wallet's leaderboard stats.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

    const wallet = String(body.wallet ?? "").toLowerCase()
    const txHash = String(body.txHash ?? "").toLowerCase()
    if (!ADDR.test(wallet)) return NextResponse.json({ error: "invalid_wallet" }, { status: 400 })
    if (!TX.test(txHash)) return NextResponse.json({ error: "invalid_tx" }, { status: 400 })

    const fromSymbol = body.fromSymbol ? String(body.fromSymbol).slice(0, 20) : null
    const toSymbol = body.toSymbol ? String(body.toSymbol).slice(0, 20) : null
    const fromAddress = body.fromAddress ? String(body.fromAddress).slice(0, 64) : null
    const toAddress = body.toAddress ? String(body.toAddress).slice(0, 64) : null
    const amountIn = body.amountIn ? String(body.amountIn).slice(0, 64) : null

    let usdValue: number | null = null
    const rawUsd = Number(body.usdValue)
    if (Number.isFinite(rawUsd) && rawUsd >= 0 && rawUsd < 1e12) usdValue = rawUsd

    await pool.query(
      `INSERT INTO merydex_trades (wallet, tx_hash, from_symbol, to_symbol, from_address, to_address, amount_in, usd_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [wallet, txHash, fromSymbol, toSymbol, fromAddress, toAddress, amountIn, usdValue],
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.log("[v0] record trade failed:", (err as Error).message)
    return NextResponse.json({ error: "server_error" }, { status: 500 })
  }
}
