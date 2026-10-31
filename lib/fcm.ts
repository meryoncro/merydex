import "server-only"

const FCM = "https://api.crypto.com/fcm/v1/public"
const EXCHANGE = "https://api.crypto.com/exchange/v1/public"

export const FCM_SYMBOL_RE = /^NX\.F\.OPT\.[A-Z0-9_]{2,20}\.I\.\d{1,6}\.\d{1,3}\.\d{8}$/

/** Rounds stop accepting new picks this close to expiry so fills can't race the settlement print. */
export const ENTRY_CUTOFF_MS = 60_000
const PRIORITY = ["CRO", "BTC", "ETH", "SOL", "XRP"]
/** A midpoint across a wider spread than this is noise, not a probability. */
const MAX_SPREAD_FOR_CHANCE = 0.3

async function getJson<T>(url: string, revalidate: number | "fresh"): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    ...(revalidate === "fresh" ? { cache: "no-store" as const } : { next: { revalidate } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res.json() as Promise<T>
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface RawInstrument {
  symbol: string
  inst_type: string
  display_name: string
  base_ccy: string
  tradable: boolean
  expiry_timestamp_ms: number
  underlying_symbol: string
}

export interface Level { price: number; size: number }

export interface HourlyMarket {
  symbol: string
  asset: string
  name: string
  strike: number
  expiresAt: number
  spotInstrument: string
  spot: number | null
  bids: Level[]
  asks: Level[]
  /** Cost to buy each side right now, and what each side sells for. */
  yesBuy: number | null
  noBuy: number | null
  yesSell: number | null
  noSell: number | null
  chance: number | null
}

const NAME_RE = /^(.*?)\s*>\s*([\d.]+)\s*\(/

async function instruments(revalidate: number | "fresh" = 30) {
  const json = await getJson<{ result: { data: RawInstrument[] } }>(`${FCM}/get-instruments`, revalidate)
  return json.result.data.filter((x) => x.inst_type === "BINARY_OPTION" && x.underlying_symbol.includes("USD-INDEX") && NAME_RE.test(x.display_name))
}

async function book(symbol: string, revalidate: number | "fresh") {
  const json = await getJson<{ result: { data: { bids: string[][]; asks: string[][] }[] } }>(
    `${FCM}/get-book?instrument_name=${encodeURIComponent(symbol)}&depth=5`,
    revalidate,
  )
  const row = json.result.data[0]
  const level = (r: string[]) => ({ price: num(r[0]), size: num(r[1]) })
  return {
    bids: (row?.bids ?? []).map(level).filter((l) => l.price > 0 && l.price < 1),
    asks: (row?.asks ?? []).map(level).filter((l) => l.price > 0 && l.price < 1),
  }
}

const tradablePrice = (p: number | null) => (p !== null && p >= 0.01 && p <= 0.99 ? Math.round(p * 1000) / 1000 : null)

function toMarket(inst: RawInstrument, levels: { bids: Level[]; asks: Level[] }, spot: number | null): HourlyMarket {
  const [, name, strike] = inst.display_name.match(NAME_RE) ?? []
  const bestBid = levels.bids[0]?.price ?? null
  const bestAsk = levels.asks[0]?.price ?? null
  return {
    symbol: inst.symbol,
    asset: inst.base_ccy,
    name: name.trim(),
    strike: num(strike),
    expiresAt: inst.expiry_timestamp_ms,
    spotInstrument: `${inst.base_ccy}_USD`,
    spot,
    bids: levels.bids,
    asks: levels.asks,
    yesBuy: tradablePrice(bestAsk),
    noBuy: tradablePrice(bestBid === null ? null : 1 - bestBid),
    yesSell: tradablePrice(bestBid),
    noSell: tradablePrice(bestAsk === null ? null : 1 - bestAsk),
    chance: bestBid !== null && bestAsk !== null && bestAsk - bestBid <= MAX_SPREAD_FOR_CHANCE ? Math.round(((bestBid + bestAsk) / 2) * 100) : null,
  }
}

async function spotPrices() {
  const json = await getJson<{ result: { data: { i: string; a: string }[] } }>(`${EXCHANGE}/get-tickers`, 10)
  return new Map(json.result.data.map((t) => [t.i, num(t.a)]))
}

/** The nearest open round per asset, each with its live order book. */
export async function listHourly(): Promise<HourlyMarket[]> {
  const now = Date.now()
  const [all, spots] = await Promise.all([instruments(), spotPrices().catch(() => new Map<string, number>())])
  const nearest = new Map<string, RawInstrument>()
  for (const inst of all) {
    if (!inst.tradable || inst.expiry_timestamp_ms - now <= ENTRY_CUTOFF_MS) continue
    const current = nearest.get(inst.base_ccy)
    if (!current || inst.expiry_timestamp_ms < current.expiry_timestamp_ms) nearest.set(inst.base_ccy, inst)
  }
  const rank = (a: string) => (PRIORITY.includes(a) ? PRIORITY.indexOf(a) : PRIORITY.length)
  const picked = [...nearest.values()].sort((a, b) => rank(a.base_ccy) - rank(b.base_ccy) || a.base_ccy.localeCompare(b.base_ccy))

  const books = await Promise.all(picked.map((i) => book(i.symbol, 3).catch(() => ({ bids: [], asks: [] }))))
  return picked.map((inst, i) => toMarket(inst, books[i], spots.get(`${inst.base_ccy}_USD`) || null))
}

/** Fresh quote straight from the book, used for fills so a cached price can never be traded against. */
export async function quoteHourly(symbol: string, fresh = true): Promise<HourlyMarket | null> {
  const inst = (await instruments(fresh ? 15 : 30)).find((i) => i.symbol === symbol)
  if (!inst) return null
  return toMarket(inst, await book(symbol, fresh ? "fresh" : 3), null)
}

/** Spot close of the minute ending at expiry on Crypto.com Exchange. */
export async function settlementPrice(spotInstrument: string, expiresAt: number): Promise<number | null> {
  const minute = expiresAt - (expiresAt % 60_000) - 60_000
  const json = await getJson<{ result: { data: { t: number; c: string }[] } }>(
    `${EXCHANGE}/get-candlestick?instrument_name=${encodeURIComponent(spotInstrument)}&timeframe=1m&start_ts=${minute - 60_000}&end_ts=${minute + 60_000}`,
    300,
  )
  const candle = json.result.data.find((c) => c.t === minute)
  const close = candle ? num(candle.c) : 0
  return close > 0 ? close : null
}
