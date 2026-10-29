import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import type { TransactionReceipt } from "ethers"
import { provider } from "@/lib/keeper"
import { valueTrade } from "@/lib/trade-value"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_TX_AGE_SECONDS = 60 * 60

/** Receipt for a successful, recent Cronos transaction actually sent by `wallet`, else null. */
async function verifiedReceipt(wallet: string, txHash: string): Promise<TransactionReceipt | null> {
  const rpc = provider()
  for (let attempt = 0; attempt < 4; attempt++) {
    const receipt = await rpc.getTransactionReceipt(txHash).catch(() => null)
    if (receipt) {
      if (receipt.status !== 1 || receipt.from.toLowerCase() !== wallet) return null
      const block = await rpc.getBlock(receipt.blockNumber).catch(() => null)
      return block && Date.now() / 1000 - block.timestamp <= MAX_TX_AGE_SECONDS ? receipt : null
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return null
}

const ADDR = /^0x[a-fA-F0-9]{40}$/
const TX = /^0x[a-fA-F0-9]{64}$/

// Record a swap executed through MCRO.FUN. Deduped on tx_hash so a retry or
// double-submit can't inflate a wallet's leaderboard stats.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

    const wallet = String(body.wallet ?? "").toLowerCase()
    const txHash = String(body.txHash ?? "").toLowerCase()
    if (!ADDR.test(wallet)) return NextResponse.json({ error: "invalid_wallet" }, { status: 400 })
    if (!TX.test(txHash)) return NextResponse.json({ error: "invalid_tx" }, { status: 400 })
    const receipt = await verifiedReceipt(wallet, txHash)
    if (!receipt) return NextResponse.json({ error: "unverified_tx" }, { status: 403 })

    const claimedFrom = ADDR.test(String(body.fromAddress ?? "")) ? String(body.fromAddress).toLowerCase() : null
    const trade = await valueTrade(provider(), receipt, wallet, claimedFrom)
    if (!trade.ok) return NextResponse.json({ error: trade.reason }, { status: 403 })

    // Symbols are display-only labels; every number below comes from the chain.
    const label = (v: unknown) => (typeof v === "string" ? v.replace(/[^\w.$-]/g, "").slice(0, 20) || null : null)
    const fromSymbol = label(body.fromSymbol)
    const toSymbol = label(body.toSymbol)
    const fromAddress = claimedFrom
    const toAddress = ADDR.test(String(body.toAddress ?? "")) ? String(body.toAddress).toLowerCase() : null
    const amountIn = trade.amountIn
    const usdValue = trade.usdValue

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
