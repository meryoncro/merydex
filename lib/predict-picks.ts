import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { getEvent, type PredictionEvent } from "@/lib/cdc"
import { ENTRY_CUTOFF_MS, quoteHourly, settlementPrice, type HourlyMarket } from "@/lib/fcm"

/** Paper points every wallet starts with. Picks are a game layer, no real funds move. */
export const STARTING_POINTS = 1000
export const MIN_STAKE = 10
export const MAX_OPEN_PICKS = 30
/** Settlement waits for the expiry minute's candle to finalize. */
const SETTLE_DELAY = "90 seconds"
/** If no settlement print exists after this long, the stake is returned rather than left stuck. */
const REFUND_AFTER = "1 day"

export type Side = "yes" | "no"
export type Venue = "cdc" | "fcm"

interface PickRow {
  id: string
  venue: Venue
  event_id: string | null
  event_title: string
  contract_id: string | null
  contract_title: string
  symbol: string | null
  spot_instrument: string | null
  strike: string | null
  expires_at: string | null
  side: Side
  stake: string
  entry_price: string
  exit_price: string | null
  created_at: string
  closed_at: string | null
}

export interface Pick {
  id: string
  venue: Venue
  eventId: string | null
  eventTitle: string
  contractTitle: string
  side: Side
  stake: number
  entryPrice: number
  currentPrice: number | null
  value: number | null
  pnl: number | null
  expiresAt: string | null
  settling: boolean
  createdAt: string
  closedAt: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const valueAt = (stake: number, entry: number, price: number) => round2((stake / entry) * price)

const cdcPrice = (event: PredictionEvent | null, contractId: string | null, side: Side) => {
  const c = event?.contracts.find((x) => x.id === contractId)
  if (!c) return null
  const p = side === "yes" ? c.yes : c.no
  return p >= 0 && p <= 1 ? p : null
}

/** What a position could be sold for right now: the bid side of the book. */
const fcmExit = (m: HourlyMarket | null, side: Side) => (m ? (side === "yes" ? m.yesSell : m.noSell) : null)
const fcmEntry = (m: HourlyMarket, side: Side) => (side === "yes" ? m.yesBuy : m.noBuy)

async function balanceOf(db: { query: PoolClient["query"] }, wallet: string) {
  const { rows } = await db.query<{ spent: string; returned: string }>(
    `SELECT COALESCE(SUM(stake), 0) AS spent,
            COALESCE(SUM(CASE WHEN closed_at IS NOT NULL THEN stake / entry_price * exit_price END), 0) AS returned
       FROM merydex_predict_picks WHERE wallet = $1`,
    [wallet],
  )
  return round2(STARTING_POINTS - Number(rows[0].spent) + Number(rows[0].returned))
}

/** Settles expired hourly picks at 1 or 0 against the spot close at expiry. Idempotent. */
async function settleExpired(wallet: string) {
  const { rows } = await pool.query<{ spot_instrument: string; strike: string; expires_at: Date; refund: boolean }>(
    `SELECT spot_instrument, strike, expires_at, bool_or(expires_at < now() - interval '${REFUND_AFTER}') AS refund
       FROM merydex_predict_picks
      WHERE wallet = $1 AND venue = 'fcm' AND closed_at IS NULL AND expires_at < now() - interval '${SETTLE_DELAY}'
      GROUP BY spot_instrument, strike, expires_at`,
    [wallet],
  )
  await Promise.all(
    rows.map(async (r) => {
      const close = await settlementPrice(r.spot_instrument, r.expires_at.getTime()).catch(() => null)
      if (close === null) {
        if (!r.refund) return
        await pool.query(
          `UPDATE merydex_predict_picks SET exit_price = entry_price, closed_at = now()
            WHERE wallet = $1 AND venue = 'fcm' AND closed_at IS NULL AND spot_instrument = $2 AND strike = $3 AND expires_at = $4`,
          [wallet, r.spot_instrument, r.strike, r.expires_at],
        )
        return
      }
      const yesWins = close > Number(r.strike)
      await pool.query(
        `UPDATE merydex_predict_picks
            SET exit_price = CASE WHEN (side = 'yes') = $5 THEN 1 ELSE 0 END, closed_at = now()
          WHERE wallet = $1 AND venue = 'fcm' AND closed_at IS NULL AND spot_instrument = $2 AND strike = $3 AND expires_at = $4`,
        [wallet, r.spot_instrument, r.strike, r.expires_at, yesWins],
      )
    }),
  )
}

export async function portfolioFor(wallet: string) {
  await settleExpired(wallet).catch((err) => console.error("[picks] settlement failed:", (err as Error).message))

  const [{ rows }, balance] = await Promise.all([
    pool.query<PickRow>(
      `(SELECT * FROM merydex_predict_picks WHERE wallet = $1 AND closed_at IS NULL ORDER BY created_at DESC LIMIT $2)
       UNION ALL
       (SELECT * FROM merydex_predict_picks WHERE wallet = $1 AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 20)`,
      [wallet, MAX_OPEN_PICKS],
    ),
    balanceOf(pool, wallet),
  ])

  const open = rows.filter((r) => !r.closed_at)
  const now = Date.now()
  const eventIds = [...new Set(open.filter((r) => r.venue === "cdc" && r.event_id).map((r) => r.event_id as string))]
  const symbols = [...new Set(open.filter((r) => r.venue === "fcm" && r.symbol && new Date(r.expires_at!).getTime() > now).map((r) => r.symbol as string))]
  const [events, quotes] = await Promise.all([
    Promise.all(eventIds.map(async (id) => [id, await getEvent(id)] as const)).then((e) => new Map(e)),
    Promise.all(symbols.map(async (s) => [s, await quoteHourly(s, false).catch(() => null)] as const)).then((q) => new Map(q)),
  ])

  const picks: Pick[] = rows.map((r) => {
    const stake = Number(r.stake)
    const entry = Number(r.entry_price)
    const expired = r.venue === "fcm" && !!r.expires_at && new Date(r.expires_at).getTime() <= now
    const price = r.closed_at
      ? Number(r.exit_price)
      : r.venue === "fcm"
        ? expired
          ? null
          : fcmExit(quotes.get(r.symbol ?? "") ?? null, r.side)
        : cdcPrice(events.get(r.event_id ?? "") ?? null, r.contract_id, r.side)
    const value = price === null ? null : valueAt(stake, entry, price)
    return {
      id: r.id,
      venue: r.venue,
      eventId: r.event_id,
      eventTitle: r.event_title,
      contractTitle: r.contract_title,
      side: r.side,
      stake,
      entryPrice: entry,
      currentPrice: price,
      value,
      pnl: value === null ? null : round2(value - stake),
      expiresAt: r.expires_at,
      settling: !r.closed_at && expired,
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

interface NewPick {
  venue: Venue
  eventId: string | null
  eventTitle: string
  contractId: string | null
  contractTitle: string
  symbol: string | null
  spotInstrument: string | null
  strike: number | null
  expiresAt: Date | null
  side: Side
  stake: number
  price: number
}

async function insertPick(wallet: string, p: NewPick): Promise<OpenResult> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`predict:${wallet}`])
    const open = await client.query<{ n: string }>("SELECT COUNT(*) AS n FROM merydex_predict_picks WHERE wallet = $1 AND closed_at IS NULL", [wallet])
    if (Number(open.rows[0].n) >= MAX_OPEN_PICKS) {
      await client.query("ROLLBACK")
      return { ok: false, error: "too_many_open" }
    }
    if ((await balanceOf(client, wallet)) < p.stake) {
      await client.query("ROLLBACK")
      return { ok: false, error: "insufficient_points" }
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO merydex_predict_picks
         (wallet, venue, event_id, event_title, contract_id, contract_title, symbol, spot_instrument, strike, expires_at, side, stake, entry_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [wallet, p.venue, p.eventId, p.eventTitle.slice(0, 200), p.contractId, p.contractTitle.slice(0, 120), p.symbol, p.spotInstrument, p.strike, p.expiresAt, p.side, p.stake, p.price],
    )
    await client.query("COMMIT")
    return { ok: true, id: rows[0].id, entryPrice: p.price }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Opens a pick at the live price fetched here, never a client-supplied one. */
export async function openPick(wallet: string, input: { eventId: string; contractId: string; side: Side; stake: number }): Promise<OpenResult> {
  const event = await getEvent(input.eventId)
  if (!event || event.status !== "active") return { ok: false, error: "market_closed" }
  const contract = event.contracts.find((c) => c.id === input.contractId)
  if (!contract || contract.status !== "active") return { ok: false, error: "market_closed" }
  const price = input.side === "yes" ? contract.yes : contract.no
  if (!(price >= 0.01 && price <= 0.99)) return { ok: false, error: "price_unavailable" }
  return insertPick(wallet, {
    venue: "cdc",
    eventId: event.id,
    eventTitle: event.title,
    contractId: contract.id,
    contractTitle: contract.title,
    symbol: null,
    spotInstrument: null,
    strike: null,
    expiresAt: null,
    side: input.side,
    stake: input.stake,
    price,
  })
}

const roundLabel = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC"

/** Opens an hourly crypto pick at the live ask from the Crypto.com FCM order book. */
export async function openHourlyPick(wallet: string, input: { symbol: string; side: Side; stake: number }): Promise<OpenResult> {
  const market = await quoteHourly(input.symbol)
  if (!market || market.expiresAt - Date.now() <= ENTRY_CUTOFF_MS) return { ok: false, error: "round_closed" }
  const price = fcmEntry(market, input.side)
  if (price === null) return { ok: false, error: "price_unavailable" }
  return insertPick(wallet, {
    venue: "fcm",
    eventId: null,
    eventTitle: `${market.name} above ${market.strike}`,
    contractTitle: `${roundLabel(market.expiresAt)} round`,
    contractId: null,
    symbol: market.symbol,
    spotInstrument: market.spotInstrument,
    strike: market.strike,
    expiresAt: new Date(market.expiresAt),
    side: input.side,
    stake: input.stake,
    price,
  })
}

export async function closePick(wallet: string, id: string): Promise<{ ok: true; exitPrice: number } | { ok: false; error: string }> {
  const { rows } = await pool.query<PickRow>(
    "SELECT * FROM merydex_predict_picks WHERE id = $1 AND wallet = $2 AND closed_at IS NULL",
    [id, wallet],
  )
  const pick = rows[0]
  if (!pick) return { ok: false, error: "not_found" }

  let price: number | null
  if (pick.venue === "fcm") {
    if (!pick.symbol || !pick.expires_at || new Date(pick.expires_at).getTime() <= Date.now()) return { ok: false, error: "settling" }
    price = fcmExit(await quoteHourly(pick.symbol), pick.side)
  } else {
    price = cdcPrice(await getEvent(pick.event_id ?? ""), pick.contract_id, pick.side)
  }
  if (price === null) return { ok: false, error: "price_unavailable" }

  const updated = await pool.query(
    "UPDATE merydex_predict_picks SET exit_price = $1, closed_at = now() WHERE id = $2 AND wallet = $3 AND closed_at IS NULL",
    [price, id, wallet],
  )
  if (updated.rowCount === 0) return { ok: false, error: "not_found" }
  return { ok: true, exitPrice: price }
}
