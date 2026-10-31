import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { getEvent, type PredictionEvent } from "@/lib/cdc"

/** Paper points every wallet starts with. Picks are a game layer, no real funds move. */
export const STARTING_POINTS = 1000
export const MIN_STAKE = 10
export const MAX_OPEN_PICKS = 30

export type Side = "yes" | "no"

interface PickRow {
  id: string
  event_id: string
  event_title: string
  contract_id: string
  contract_title: string
  side: Side
  stake: string
  entry_price: string
  exit_price: string | null
  created_at: string
  closed_at: string | null
}

export interface Pick {
  id: string
  eventId: string
  eventTitle: string
  contractId: string
  contractTitle: string
  side: Side
  stake: number
  entryPrice: number
  currentPrice: number | null
  value: number | null
  pnl: number | null
  createdAt: string
  closedAt: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const valueAt = (stake: number, entry: number, price: number) => round2((stake / entry) * price)

const priceFor = (event: PredictionEvent | null, contractId: string, side: Side) => {
  const c = event?.contracts.find((x) => x.id === contractId)
  if (!c) return null
  const p = side === "yes" ? c.yes : c.no
  return p >= 0 && p <= 1 ? p : null
}

async function balanceOf(db: { query: PoolClient["query"] }, wallet: string) {
  const { rows } = await db.query<{ spent: string; returned: string }>(
    `SELECT COALESCE(SUM(stake), 0) AS spent,
            COALESCE(SUM(CASE WHEN closed_at IS NOT NULL THEN stake / entry_price * exit_price END), 0) AS returned
       FROM merydex_predict_picks WHERE wallet = $1`,
    [wallet],
  )
  return round2(STARTING_POINTS - Number(rows[0].spent) + Number(rows[0].returned))
}

export async function portfolioFor(wallet: string) {
  const [{ rows }, balance] = await Promise.all([
    pool.query<PickRow>(
      `(SELECT * FROM merydex_predict_picks WHERE wallet = $1 AND closed_at IS NULL ORDER BY created_at DESC LIMIT $2)
       UNION ALL
       (SELECT * FROM merydex_predict_picks WHERE wallet = $1 AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 20)`,
      [wallet, MAX_OPEN_PICKS],
    ),
    balanceOf(pool, wallet),
  ])

  const openEventIds = [...new Set(rows.filter((r) => !r.closed_at).map((r) => r.event_id))]
  const events = new Map((await Promise.all(openEventIds.map(async (id) => [id, await getEvent(id)] as const))))

  const picks: Pick[] = rows.map((r) => {
    const stake = Number(r.stake)
    const entry = Number(r.entry_price)
    const price = r.closed_at ? Number(r.exit_price) : priceFor(events.get(r.event_id) ?? null, r.contract_id, r.side)
    const value = price === null ? null : valueAt(stake, entry, price)
    return {
      id: r.id,
      eventId: r.event_id,
      eventTitle: r.event_title,
      contractId: r.contract_id,
      contractTitle: r.contract_title,
      side: r.side,
      stake,
      entryPrice: entry,
      currentPrice: price,
      value,
      pnl: value === null ? null : round2(value - stake),
      createdAt: r.created_at,
      closedAt: r.closed_at,
    }
  })

  const openValue = picks.filter((p) => !p.closedAt).reduce((s, p) => s + (p.value ?? p.stake), 0)
  return { balance, openValue: round2(openValue), netWorth: round2(balance + openValue), startingPoints: STARTING_POINTS, picks }
}

export async function leaderboard() {
  const { rows } = await pool.query<{ wallet: string; realized: string; picks: string }>(
    `SELECT wallet, SUM(stake / entry_price * exit_price - stake) AS realized, COUNT(*) AS picks
       FROM merydex_predict_picks WHERE closed_at IS NOT NULL
      GROUP BY wallet ORDER BY realized DESC LIMIT 10`,
  )
  return rows.map((r) => ({
    wallet: `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`,
    realized: round2(Number(r.realized)),
    picks: Number(r.picks),
  }))
}

type OpenResult = { ok: true; id: string; entryPrice: number } | { ok: false; error: string }

/** Opens a pick at the live price fetched here, never a client-supplied one. */
export async function openPick(wallet: string, input: { eventId: string; contractId: string; side: Side; stake: number }): Promise<OpenResult> {
  const event = await getEvent(input.eventId)
  if (!event || event.status !== "active") return { ok: false, error: "market_closed" }
  const contract = event.contracts.find((c) => c.id === input.contractId)
  if (!contract || contract.status !== "active") return { ok: false, error: "market_closed" }
  const price = input.side === "yes" ? contract.yes : contract.no
  if (!(price >= 0.01 && price <= 0.99)) return { ok: false, error: "price_unavailable" }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`predict:${wallet}`])
    const open = await client.query<{ n: string }>("SELECT COUNT(*) AS n FROM merydex_predict_picks WHERE wallet = $1 AND closed_at IS NULL", [wallet])
    if (Number(open.rows[0].n) >= MAX_OPEN_PICKS) {
      await client.query("ROLLBACK")
      return { ok: false, error: "too_many_open" }
    }
    if ((await balanceOf(client, wallet)) < input.stake) {
      await client.query("ROLLBACK")
      return { ok: false, error: "insufficient_points" }
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO merydex_predict_picks (wallet, event_id, event_title, contract_id, contract_title, side, stake, entry_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [wallet, event.id, event.title.slice(0, 200), contract.id, contract.title.slice(0, 120), input.side, input.stake, price],
    )
    await client.query("COMMIT")
    return { ok: true, id: rows[0].id, entryPrice: price }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function closePick(wallet: string, id: string): Promise<{ ok: true; exitPrice: number } | { ok: false; error: string }> {
  const { rows } = await pool.query<PickRow>(
    "SELECT * FROM merydex_predict_picks WHERE id = $1 AND wallet = $2 AND closed_at IS NULL",
    [id, wallet],
  )
  const pick = rows[0]
  if (!pick) return { ok: false, error: "not_found" }
  const price = priceFor(await getEvent(pick.event_id), pick.contract_id, pick.side)
  if (price === null) return { ok: false, error: "price_unavailable" }
  const updated = await pool.query(
    "UPDATE merydex_predict_picks SET exit_price = $1, closed_at = now() WHERE id = $2 AND wallet = $3 AND closed_at IS NULL",
    [price, id, wallet],
  )
  if (updated.rowCount === 0) return { ok: false, error: "not_found" }
  return { ok: true, exitPrice: price }
}
