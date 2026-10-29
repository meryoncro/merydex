import "server-only"
import { Contract, JsonRpcProvider, MaxUint256, Wallet, getAddress, parseUnits, formatUnits } from "ethers"
import { pool } from "@/lib/db"
import { getTokenBySymbol } from "@/lib/tokens"
import { nextRunSlot } from "@/lib/recurring"
import { buildSwap, quoteExactIn } from "@/lib/wolfswap"

const ERC20 = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]
const WCRO_ABI = [...ERC20, "function deposit() payable", "function withdraw(uint256)"]

const MIN_KEEPER_GAS_CRO = "0.5"
const MAX_CONSECUTIVE_FAILS = 3
const LOCK_MINUTES = 6
const RUN_BUDGET_MS = 240_000

export function wcroAddress(): string {
  const addr = process.env.WCRO || getTokenBySymbol("WCRO")?.address
  if (!addr) throw new Error("WCRO is not configured")
  return getAddress(addr)
}

export function provider(): JsonRpcProvider {
  return new JsonRpcProvider(process.env.RPC_URL || "https://evm.cronos.org", 25, { staticNetwork: true })
}

function keeperWallet(): Wallet | null {
  const key = process.env.KEEPER_PRIVATE_KEY
  if (!key) return null
  try {
    return new Wallet(key.startsWith("0x") ? key : `0x${key}`, provider())
  } catch {
    return null
  }
}

export function keeperAddress(): string | null {
  return keeperWallet()?.address ?? null
}

export async function readToken(address: string) {
  const c = new Contract(address, ERC20, provider())
  const [decimals, symbol] = await Promise.all([c.decimals(), c.symbol().catch(() => "TOKEN")])
  return { decimals: Number(decimals), symbol: String(symbol).slice(0, 20) }
}

type OrderRow = {
  id: string
  owner: string
  side: "buy" | "sell"
  token_address: string
  token_symbol: string
  token_decimals: number
  amount_per_run: string
  runs_total: number
  runs_done: number
  slippage_bps: number
  fail_count: number
}

/** Raised when the keeper itself can't operate; no user order should be penalized. */
class KeeperUnavailable extends Error {}

async function acquireLock(): Promise<boolean> {
  await pool.query("INSERT INTO merydex_keeper_lock (id) VALUES (1) ON CONFLICT DO NOTHING")
  const { rowCount } = await pool.query(
    `UPDATE merydex_keeper_lock SET locked_until = now() + ($1 || ' minutes')::interval WHERE id = 1 AND locked_until < now()`,
    [String(LOCK_MINUTES)],
  )
  return rowCount === 1
}

async function releaseLock() {
  await pool.query("UPDATE merydex_keeper_lock SET locked_until = 'epoch' WHERE id = 1")
}

async function usdPrice(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/cronos/${address}`, { cache: "no-store" })
    const pairs = (await res.json()) as { priceUsd?: string; liquidity?: { usd?: number }; baseToken?: { address?: string } }[]
    const best = pairs
      .filter((p) => p.baseToken?.address?.toLowerCase() === address.toLowerCase() && p.priceUsd)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
    return best ? Number(best.priceUsd) : null
  } catch {
    return null
  }
}

async function executeOrder(keeper: Wallet, order: OrderRow): Promise<string> {
  const wcro = wcroAddress()
  const owner = getAddress(order.owner)
  const isBuy = order.side === "buy"
  const tokenIn = isBuy ? wcro : getAddress(order.token_address)
  const tokenOut = isBuy ? getAddress(order.token_address) : wcro
  const amount = parseUnits(order.amount_per_run, isBuy ? 18 : order.token_decimals)

  const gas = await keeper.provider!.getBalance(keeper.address)
  if (gas < parseUnits(MIN_KEEPER_GAS_CRO, 18)) throw new KeeperUnavailable("Keeper is low on CRO for gas")

  const inToken = new Contract(tokenIn, isBuy ? WCRO_ABI : ERC20, keeper)
  const [allowance, balance]: [bigint, bigint] = await Promise.all([
    inToken.allowance(owner, keeper.address),
    inToken.balanceOf(owner),
  ])
  const unit = isBuy ? "WCRO" : order.token_symbol
  if (allowance < amount) throw new Error(`Keeper allowance for ${unit} is too low`)
  if (balance < amount) throw new Error(`Not enough ${unit} in wallet`)

  // Build the route before moving any funds, so a routing failure costs nothing.
  const { quoteId } = await quoteExactIn(tokenIn, tokenOut, amount)
  const { router, calldata } = await buildSwap(quoteId, owner, order.slippage_bps)

  await (await inToken.transferFrom(owner, keeper.address, amount)).wait()

  let unwrapped = false
  try {
    let value = BigInt(0)
    if (isBuy) {
      // The router takes WCRO input as native CRO (msg.value); WCRO approval alone reverts.
      await (await inToken.withdraw(amount)).wait()
      unwrapped = true
      value = amount
    } else if ((await inToken.allowance(keeper.address, router)) < amount) {
      await (await inToken.approve(router, MaxUint256)).wait()
    }
    const tx = await keeper.sendTransaction({ to: router, data: calldata, value })
    const receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) throw new Error("Swap transaction reverted")
    return tx.hash
  } catch (swapError) {
    try {
      if (unwrapped) await (await inToken.deposit({ value: amount })).wait()
      await (await inToken.transfer(owner, amount)).wait()
    } catch {
      throw new Error(`Swap failed and refund is pending: ${formatUnits(amount, isBuy ? 18 : order.token_decimals)} ${unit}`)
    }
    throw swapError
  }
}

function shortError(e: unknown): string {
  const err = e as { shortMessage?: string; reason?: string; message?: string }
  const msg = err?.reason || err?.shortMessage || err?.message || "Run failed"
  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg
}

async function recordSuccess(order: OrderRow, txHash: string) {
  const done = order.runs_done + 1
  const finished = done >= order.runs_total
  await pool.query(
    `UPDATE merydex_recurring_orders
       SET runs_done = $2, last_tx = $3, last_error = NULL, fail_count = 0,
           next_run_at = $4, status = CASE WHEN $5 THEN 'completed' ELSE status END
     WHERE id = $1`,
    [order.id, done, txHash, nextRunSlot(new Date()), finished],
  )
  await pool.query(`INSERT INTO merydex_recurring_runs (order_id, status, tx_hash) VALUES ($1, 'success', $2)`, [order.id, txHash])

  const wcro = wcroAddress()
  const isBuy = order.side === "buy"
  const fromAddress = isBuy ? wcro : order.token_address
  const price = await usdPrice(fromAddress)
  await pool.query(
    `INSERT INTO merydex_trades (wallet, tx_hash, from_symbol, to_symbol, from_address, to_address, amount_in, usd_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tx_hash) DO NOTHING`,
    [
      order.owner,
      txHash,
      isBuy ? "WCRO" : order.token_symbol,
      isBuy ? order.token_symbol : "CRO",
      fromAddress.toLowerCase(),
      (isBuy ? order.token_address : wcro).toLowerCase(),
      order.amount_per_run,
      price != null ? Number(order.amount_per_run) * price : null,
    ],
  )
}

async function recordFailure(order: OrderRow, error: string) {
  const fails = order.fail_count + 1
  await pool.query(
    `UPDATE merydex_recurring_orders
       SET fail_count = $2, last_error = $3, next_run_at = $4,
           status = CASE WHEN $5 THEN 'failed' ELSE status END
     WHERE id = $1`,
    [order.id, fails, error, nextRunSlot(new Date()), fails >= MAX_CONSECUTIVE_FAILS],
  )
  await pool.query(`INSERT INTO merydex_recurring_runs (order_id, status, error) VALUES ($1, 'failed', $2)`, [order.id, error])
}

/** Runs every due order once. Safe to call concurrently: a DB lock keeps the keeper's nonces sequential. */
export async function runDueOrders(): Promise<{ ran: number; succeeded: number; skipped?: string }> {
  const keeper = keeperWallet()
  if (!keeper) return { ran: 0, succeeded: 0, skipped: "Keeper wallet is not configured" }
  if (!(await acquireLock())) return { ran: 0, succeeded: 0, skipped: "Another run is in progress" }

  const started = Date.now()
  let ran = 0
  let succeeded = 0
  try {
    const { rows } = await pool.query<OrderRow>(
      `SELECT id, owner, side, token_address, token_symbol, token_decimals, amount_per_run, runs_total, runs_done, slippage_bps, fail_count
         FROM merydex_recurring_orders
        WHERE status = 'active' AND next_run_at <= now()
        ORDER BY next_run_at ASC
        LIMIT 100`,
    )
    for (const order of rows) {
      if (Date.now() - started > RUN_BUDGET_MS) break
      ran++
      try {
        const hash = await executeOrder(keeper, order)
        await recordSuccess(order, hash)
        succeeded++
      } catch (e) {
        if (e instanceof KeeperUnavailable) return { ran, succeeded, skipped: e.message }
        await recordFailure(order, shortError(e))
      }
    }
  } finally {
    await releaseLock()
  }
  return { ran, succeeded }
}
