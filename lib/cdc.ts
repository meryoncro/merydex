import "server-only"

const EXCHANGE = "https://api.crypto.com/exchange/v1/public"
const PREDICTIONS = "https://data-api.crypto.com/api/v1/predictions"

export const INSTRUMENT_RE = /^[A-Z0-9]{1,20}_[A-Z0-9]{2,10}$/
export const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1D"] as const
export type Timeframe = (typeof TIMEFRAMES)[number]
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const KIND_LABELS: Record<string, string> = {
  CRYPT: "Crypto",
  ELECT: "Politics",
  EC: "Economy",
  UCL: "Champions League",
  CFB: "College Football",
  CUL: "Culture",
  NFL: "NFL",
  NBA: "NBA",
  MLB: "MLB",
  NHL: "NHL",
  UFC: "UFC",
  F1: "F1",
  TENNIS: "Tennis",
  GOLF: "Golf",
  MLS: "MLS",
  NSCAR: "NASCAR",
  WNBA: "WNBA",
  CRO: "Cronos",
}

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res.json() as Promise<T>
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/* ------------------------------- Exchange -------------------------------- */

export interface Ticker {
  instrument: string
  base: string
  quote: string
  last: number
  change: number
  high: number
  low: number
  volumeUsd: number
  bid: number
  ask: number
}

type RawTicker = { i: string; a: string; c: string; h: string; l: string; vv: string; b: string; k: string }

/** Spot USD/USDT markets ranked by 24h notional volume. */
export async function topTickers(limit = 40): Promise<Ticker[]> {
  const json = await getJson<{ result: { data: RawTicker[] } }>(`${EXCHANGE}/get-tickers`, 10)
  return json.result.data
    .filter((t) => /^[A-Z0-9]+_(USD|USDT)$/.test(t.i))
    .map((t) => {
      const [base, quote] = t.i.split("_")
      return {
        instrument: t.i,
        base,
        quote,
        last: num(t.a),
        change: num(t.c),
        high: num(t.h),
        low: num(t.l),
        volumeUsd: num(t.vv),
        bid: num(t.b),
        ask: num(t.k),
      }
    })
    .filter((t) => t.last > 0 && t.base !== "USDT" && t.base !== "USDC")
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, limit)
}

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
export interface BookLevel { price: number; size: number }
export interface Trade { id: string; t: number; price: number; size: number; side: "buy" | "sell" }

export interface InstrumentView {
  ticker: Ticker | null
  candles: Candle[]
  book: { bids: BookLevel[]; asks: BookLevel[] }
  trades: Trade[]
}

export async function instrumentView(instrument: string, timeframe: Timeframe): Promise<InstrumentView> {
  const q = encodeURIComponent(instrument)
  const [tick, candles, book, trades] = await Promise.all([
    getJson<{ result: { data: RawTicker[] } }>(`${EXCHANGE}/get-tickers?instrument_name=${q}`, 5),
    getJson<{ result: { data: { t: number; o: string; h: string; l: string; c: string; v: string }[] } }>(
      `${EXCHANGE}/get-candlestick?instrument_name=${q}&timeframe=${timeframe}&count=120`,
      timeframe === "5m" ? 15 : 30,
    ),
    getJson<{ result: { data: { bids: string[][]; asks: string[][] }[] } }>(`${EXCHANGE}/get-book?instrument_name=${q}&depth=15`, 3),
    getJson<{ result: { data: { d: string; t: number; p: string; q: string; s: string }[] } }>(
      `${EXCHANGE}/get-trades?instrument_name=${q}&count=30`,
      3,
    ),
  ])

  const t = tick.result.data[0]
  const [base, quote] = instrument.split("_")
  const level = (row: string[]) => ({ price: num(row[0]), size: num(row[1]) })

  return {
    ticker: t
      ? { instrument, base, quote, last: num(t.a), change: num(t.c), high: num(t.h), low: num(t.l), volumeUsd: num(t.vv), bid: num(t.b), ask: num(t.k) }
      : null,
    candles: candles.result.data
      .map((c) => ({ t: c.t, o: num(c.o), h: num(c.h), l: num(c.l), c: num(c.c), v: num(c.v) }))
      .sort((a, b) => a.t - b.t),
    book: {
      bids: (book.result.data[0]?.bids ?? []).map(level),
      asks: (book.result.data[0]?.asks ?? []).map(level),
    },
    trades: trades.result.data.map((x) => ({ id: x.d, t: x.t, price: num(x.p), size: num(x.q), side: x.s === "sell" ? "sell" : "buy" })),
  }
}

/* ------------------------------ Predictions ------------------------------ */

export interface Contract {
  id: string
  title: string
  status: string
  yes: number
  no: number
  chance: number
  payoutPer100: number
  color: string | null
}

export interface PredictionEvent {
  id: string
  title: string
  kind: string
  kindLabel: string
  status: string
  eventDate: string | null
  trending: boolean
  contractsCount: number
  contracts: Contract[]
}

type RawContract = {
  id: string
  title: string
  status: string
  yes: string
  no: string
  chance: string
  payout_per_100: string
  team?: { color?: string; display_name?: string }
}
type RawEvent = {
  id: string
  title: string
  kind: string
  status: string
  event_date?: string
  contracts_count?: number
  metadata?: { trending?: boolean }
  contracts?: RawContract[]
}

const COLOR_RE = /^#[0-9a-f]{6}$/i

function normalizeEvent(e: RawEvent): PredictionEvent {
  const contracts = (e.contracts ?? [])
    .map((c) => ({
      id: c.id,
      title: c.team?.display_name || c.title,
      status: c.status,
      yes: num(c.yes),
      no: num(c.no),
      chance: num(c.chance),
      payoutPer100: num(c.payout_per_100),
      color: c.team?.color && COLOR_RE.test(c.team.color) ? c.team.color : null,
    }))
    .sort((a, b) => b.chance - a.chance)
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    kindLabel: KIND_LABELS[e.kind] ?? e.kind,
    status: e.status,
    eventDate: e.event_date ?? null,
    trending: !!e.metadata?.trending,
    contractsCount: e.contracts_count ?? contracts.length,
    contracts,
  }
}

export interface EventPage { events: PredictionEvent[]; nextCursor: string | null }

const CRYPTO_KINDS = new Set(["CRYPT", "BTC", "ETH", "CRO", "SOL", "XRP", "DOGE", "ADA", "SEI", "ONDO", "LINK", "SHIB", "LTC", "BCH", "AVAX", "DOT", "HBAR", "XLM"])
const SPORT_KINDS = new Set(["NFL", "NBA", "CFB", "TENNIS", "MLS", "NHL", "GOLF", "UCL", "NSCAR", "WNBA", "MLB", "UFC", "F1", "LMX"])

/** The upstream `category` param is ignored, so groups are resolved from event kinds. */
export const GROUPS: Record<string, (kind: string) => boolean> = {
  cronos: (k) => k === "CRO",
  crypto: (k) => CRYPTO_KINDS.has(k),
  politics: (k) => k === "ELECT",
  economy: (k) => k === "EC",
  sports: (k) => SPORT_KINDS.has(k),
  culture: (k) => k === "CUL",
}

const PAGE_SIZE = 24
const MAX_UPSTREAM_PAGES = 8

async function allActiveEvents(): Promise<PredictionEvent[]> {
  const out: PredictionEvent[] = []
  let cursor = ""
  for (let i = 0; i < MAX_UPSTREAM_PAGES; i++) {
    const json = await getJson<{ data: RawEvent[]; pagination?: { next_cursor?: string | null; has_more?: boolean } }>(
      `${PREDICTIONS}/events?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      60,
    )
    for (const e of json.data) if (e.status === "active") out.push(normalizeEvent(e))
    if (!json.pagination?.has_more || !json.pagination.next_cursor) break
    cursor = json.pagination.next_cursor
  }
  return out
}

export async function listEvents(opts: { group?: string; q?: string; page?: number }): Promise<EventPage> {
  const all = await allActiveEvents()
  const match = opts.group ? GROUPS[opts.group] : null
  const q = opts.q?.toLowerCase()
  const filtered = all
    .filter((e) => (!match || match(e.kind)) && (!q || e.title.toLowerCase().includes(q) || e.contracts.some((c) => c.title.toLowerCase().includes(q))))
    .sort((a, b) => Number(b.trending) - Number(a.trending))
  const page = opts.page ?? 0
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return { events: slice, nextCursor: (page + 1) * PAGE_SIZE < filtered.length ? String(page + 1) : null }
}

export async function getEvent(id: string): Promise<PredictionEvent | null> {
  try {
    const json = await getJson<{ data: RawEvent }>(`${PREDICTIONS}/events/${encodeURIComponent(id)}`, 15)
    return json.data ? normalizeEvent(json.data) : null
  } catch {
    return null
  }
}
