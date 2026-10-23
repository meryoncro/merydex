import { NextResponse, after } from "next/server"
import { createHash } from "node:crypto"
import { Contract, getAddress, isAddress, parseUnits, verifyMessage } from "ethers"
import { pool } from "@/lib/db"
import { keeperAddress, provider, readToken, runDueOrders, wcroAddress } from "@/lib/keeper"
import {
  MAX_RUNS,
  MIN_RUNS,
  RUN_HOUR_UTC,
  cancelOrderMessage,
  recurringOrderMessage,
  type RecurringOrder,
  type RecurringSide,
} from "@/lib/recurring"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000
const MAX_ACTIVE_PER_WALLET = 10

type Row = {
  id: string
  side: RecurringSide
  token_address: string
  token_symbol: string
  token_decimals: number
  amount_per_run: string
  runs_total: number
  runs_done: number
  slippage_bps: number
  status: RecurringOrder["status"]
  next_run_at: Date
  fail_count: number
  last_error: string | null
  last_tx: string | null
  created_at: Date
}

function toOrder(r: Row): RecurringOrder {
  return {
    id: Number(r.id),
    side: r.side,
    tokenAddress: r.token_address,
    tokenSymbol: r.token_symbol,
    tokenDecimals: r.token_decimals,
    amountPerRun: r.amount_per_run,
    runsTotal: r.runs_total,
    runsDone: r.runs_done,
    slippageBps: r.slippage_bps,
    status: r.status,
    nextRunAt: r.next_run_at.toISOString(),
    failCount: r.fail_count,
    lastError: r.last_error,
    lastTx: r.last_tx,
    createdAt: r.created_at.toISOString(),
  }
}

function freshIssuedAt(issuedAt: unknown): issuedAt is string {
  if (typeof issuedAt !== "string") return false
  const ms = Date.parse(issuedAt)
  return Number.isFinite(ms) && Math.abs(Date.now() - ms) <= MAX_SIGNATURE_AGE_MS
}

function signerMatches(message: string, signature: unknown, wallet: string): boolean {
  if (typeof signature !== "string") return false
  try {
    return verifyMessage(message, signature) === wallet
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")
  const keeper = keeperAddress()
  if (!address || !isAddress(address)) {
    return NextResponse.json({ keeper, runHourUtc: RUN_HOUR_UTC, orders: [] })
  }
  const { rows } = await pool.query<Row>(
    `SELECT * FROM merydex_recurring_orders WHERE owner = $1 ORDER BY (status = 'active') DESC, created_at DESC LIMIT 30`,
    [address.toLowerCase()],
  )
  return NextResponse.json({ keeper, runHourUtc: RUN_HOUR_UTC, orders: rows.map(toOrder) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  const keeper = keeperAddress()
  if (!keeper) return NextResponse.json({ error: "Recurring orders are not enabled yet." }, { status: 503 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const { owner, side, tokenAddress, tokenSymbol, amountPerRun, runs, slippageBps, issuedAt, signature } = body ?? {}

  if (typeof owner !== "string" || !isAddress(owner)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 })
  if (side !== "buy" && side !== "sell") return NextResponse.json({ error: "Invalid side" }, { status: 400 })
  if (typeof tokenAddress !== "string" || !isAddress(tokenAddress)) return NextResponse.json({ error: "Invalid token" }, { status: 400 })
  if (typeof tokenSymbol !== "string" || tokenSymbol.length === 0 || tokenSymbol.length > 20) {
    return NextResponse.json({ error: "Invalid token symbol" }, { status: 400 })
  }
  const runCount = Number(runs)
  if (!Number.isInteger(runCount) || runCount < MIN_RUNS || runCount > MAX_RUNS) {
    return NextResponse.json({ error: `Runs must be between ${MIN_RUNS} and ${MAX_RUNS}` }, { status: 400 })
  }
  const bps = Number(slippageBps)
  if (!Number.isInteger(bps) || bps < 10 || bps > 2000) return NextResponse.json({ error: "Slippage must be 0.1%–20%" }, { status: 400 })
  if (typeof amountPerRun !== "string" || !/^\d+(\.\d+)?$/.test(amountPerRun) || Number(amountPerRun) <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
  }
  if (!freshIssuedAt(issuedAt)) return NextResponse.json({ error: "Signature expired, please try again" }, { status: 400 })

  const wallet = getAddress(owner)
  const token = getAddress(tokenAddress)
  const wcro = wcroAddress()
  if (token === wcro) return NextResponse.json({ error: "Pick a token other than CRO/WCRO" }, { status: 400 })

  const message = recurringOrderMessage({
    owner: wallet,
    side,
    tokenAddress: token,
    tokenSymbol,
    amountPerRun,
    runs: runCount,
    slippageBps: bps,
    keeper,
    issuedAt,
  })
  if (!signerMatches(message, signature, wallet)) return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 })

  let meta: { decimals: number; symbol: string }
  try {
    meta = await readToken(token)
  } catch {
    return NextResponse.json({ error: "Could not read this token on Cronos" }, { status: 400 })
  }

  const inDecimals = side === "buy" ? 18 : meta.decimals
  let perRunWei: bigint
  try {
    perRunWei = parseUnits(amountPerRun, inDecimals)
  } catch {
    return NextResponse.json({ error: "Amount has too many decimals" }, { status: 400 })
  }

  // The allowance must cover this order plus what other active orders still need from the same token.
  const tokenIn = side === "buy" ? wcro : token
  const { rows: active } = await pool.query<{ side: RecurringSide; token_address: string; token_decimals: number; amount_per_run: string; runs_total: number; runs_done: number }>(
    `SELECT side, token_address, token_decimals, amount_per_run, runs_total, runs_done FROM merydex_recurring_orders WHERE owner = $1 AND status = 'active'`,
    [wallet.toLowerCase()],
  )
  if (active.length >= MAX_ACTIVE_PER_WALLET) {
    return NextResponse.json({ error: `You can have up to ${MAX_ACTIVE_PER_WALLET} active orders` }, { status: 400 })
  }
  let committed = BigInt(0)
  for (const o of active) {
    const oIn = o.side === "buy" ? wcro : getAddress(o.token_address)
    if (oIn !== tokenIn) continue
    committed += parseUnits(o.amount_per_run, o.side === "buy" ? 18 : o.token_decimals) * BigInt(o.runs_total - o.runs_done)
  }
  const needed = committed + perRunWei * BigInt(runCount)
  const allowance: bigint = await new Contract(tokenIn, ["function allowance(address,address) view returns (uint256)"], provider()).allowance(wallet, keeper)
  if (allowance < needed) {
    return NextResponse.json({ error: "Keeper allowance is lower than the order total. Approve again." }, { status: 400 })
  }

  const sigHash = createHash("sha256").update(String(signature)).digest("hex")
  try {
    await pool.query(
      `INSERT INTO merydex_recurring_orders
         (owner, side, token_address, token_symbol, token_decimals, amount_per_run, runs_total, slippage_bps, next_run_at, sig_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9)`,
      [wallet.toLowerCase(), side, token.toLowerCase(), meta.symbol, meta.decimals, amountPerRun, runCount, bps, sigHash],
    )
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return NextResponse.json({ error: "This order was already submitted" }, { status: 409 })
    throw e
  }

  // The first run executes right away; later runs follow the daily schedule.
  after(() => runDueOrders().catch(() => undefined))
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const { owner, id, issuedAt, signature } = body ?? {}
  if (typeof owner !== "string" || !isAddress(owner)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 })
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "Invalid order" }, { status: 400 })
  if (!freshIssuedAt(issuedAt)) return NextResponse.json({ error: "Signature expired, please try again" }, { status: 400 })

  const wallet = getAddress(owner)
  if (!signerMatches(cancelOrderMessage(wallet, orderId, issuedAt), signature, wallet)) {
    return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 })
  }
  const { rowCount } = await pool.query(
    `UPDATE merydex_recurring_orders SET status = 'cancelled' WHERE id = $1 AND owner = $2 AND status = 'active'`,
    [orderId, wallet.toLowerCase()],
  )
  if (rowCount !== 1) return NextResponse.json({ error: "Order not found or already finished" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
