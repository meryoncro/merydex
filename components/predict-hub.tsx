"use client"

import { useState } from "react"
import useSWR from "swr"
import useSWRInfinite from "swr/infinite"
import { Flame, Loader2, Search, Trophy, Wallet, X } from "lucide-react"
import { PICK_ERRORS as ERRORS, cents, fetcher, picksAction, pts } from "@/lib/predict-client"
import { HourlyBoard, HourlyTicket } from "@/components/predict-hourly"

interface Contract { id: string; title: string; status: string; yes: number; no: number; chance: number; payoutPer100: number; color: string | null }
interface PEvent { id: string; title: string; kind: string; kindLabel: string; status: string; eventDate: string | null; trending: boolean; contractsCount: number; contracts: Contract[] }
interface Pick {
  id: string
  eventId: string
  eventTitle: string
  contractTitle: string
  side: "yes" | "no"
  stake: number
  entryPrice: number
  currentPrice: number | null
  value: number | null
  pnl: number | null
  venue: "cdc" | "fcm"
  settling: boolean
  closedAt: string | null
}
interface PicksData {
  portfolio: { balance: number; openValue: number; netWorth: number; startingPoints: number; picks: Pick[] } | null
  leaders: { wallet: string; realized: number; picks: number }[]
  minStake: number
}

const CATEGORIES = [
  { kind: "", label: "All" },
  { kind: "cronos", label: "Cronos" },
  { kind: "crypto", label: "Crypto" },
  { kind: "politics", label: "Politics" },
  { kind: "economy", label: "Economy" },
  { kind: "sports", label: "Sports" },
  { kind: "culture", label: "Culture" },
]

function OddsBar({ c }: { c: Contract }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-slate-200">{c.title}</span>
        <span className="font-display font-bold tabular-nums text-white">{Math.round(c.chance)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#f2b33d]" style={{ width: `${Math.min(100, c.chance)}%`, backgroundColor: c.color ?? undefined }} />
      </div>
    </div>
  )
}

function EventCard({ event, active, onOpen }: { event: PEvent; active: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className={`flex flex-col gap-3 rounded-lg border p-4 text-left transition ${active ? "border-[#f2b33d]/60 bg-[#f2b33d]/[0.06] shadow-sm" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
    >
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#f0616d]/15 px-2 py-0.5 font-display text-[10px] font-bold tracking-normal text-[#f0616d]">{event.kindLabel}</span>
        {event.trending && (
          <span className="flex items-center gap-1 font-display text-[10px] font-bold tracking-normal text-[#3dd68c]">
            <Flame size={12} aria-hidden="true" /> Trending
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-500">{event.contractsCount} outcomes</span>
      </div>
      <h3 className="font-display text-base font-bold leading-snug text-white text-pretty">{event.title}</h3>
      {event.contracts.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {event.contracts.slice(0, 3).map((c) => (
            <OddsBar key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <span className="text-xs text-slate-400">Tap to load live odds</span>
      )}
    </button>
  )
}

function Ticket({
  eventId,
  account,
  onConnect,
  balance,
  minStake,
  onPlaced,
  onClose,
}: {
  eventId: string
  account: string | null
  onConnect: () => void
  balance: number | null
  minStake: number
  onPlaced: () => void
  onClose: () => void
}) {
  const { data, error } = useSWR<{ event: PEvent }>(`/api/predict?event=${eventId}`, fetcher, { refreshInterval: 15_000 })
  const [contractId, setContractId] = useState<string | null>(null)
  const [side, setSide] = useState<"yes" | "no">("yes")
  const [stake, setStake] = useState("100")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const event = data?.event
  const contract = event?.contracts.find((c) => c.id === contractId) ?? event?.contracts[0]
  const price = contract ? (side === "yes" ? contract.yes : contract.no) : 0
  const stakeN = Math.floor(Number(stake) || 0)
  const payout = price > 0 ? stakeN / price : 0
  const tradable = !!contract && contract.status === "active" && price >= 0.01 && price <= 0.99

  async function place() {
    if (!account || !event || !contract) return
    setBusy(true)
    setNotice(null)
    try {
      const r = await picksAction(account, { action: "open", eventId: event.id, contractId: contract.id, side, stake: stakeN })
      setNotice(r.ok ? { tone: "ok", text: `Pick placed: ${side.toUpperCase()} ${contract.title} for ${pts(stakeN)} pts.` } : { tone: "error", text: ERRORS[r.error] ?? "Something went wrong." })
      if (r.ok) onPlaced()
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message || "Signature was cancelled." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[#f2b33d]/30 bg-[#111317] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold leading-snug text-white text-pretty">{event?.title ?? "Loading market…"}</h2>
        <button onClick={onClose} aria-label="Close ticket" className="rounded p-1 text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {error && !event && <p className="text-sm text-[#f58a93]">Couldn&apos;t load this market.</p>}
      {!event && !error && <Loader2 size={18} className="animate-spin text-slate-400" aria-label="Loading" />}

      {event && (
        <>
          <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1" aria-label="Outcomes">
            {event.contracts.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setContractId(c.id)}
                  aria-pressed={contract?.id === c.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${contract?.id === c.id ? "border-[#f2b33d]/60 bg-[#f2b33d]/10" : "border-white/10 hover:border-white/25"}`}
                >
                  <span className="truncate text-slate-100">{c.title}</span>
                  <span className="flex shrink-0 gap-2 font-mono text-xs tabular-nums">
                    <span className="text-[#3dd68c]">Y {cents(c.yes)}</span>
                    <span className="text-[#f0616d]">N {cents(c.no)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {contract && (
            <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Side">
                {(["yes", "no"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    aria-pressed={side === s}
                    className={`rounded-md py-2.5 font-display text-xs font-bold tracking-normal transition ${
                      side === s ? (s === "yes" ? "bg-[#3dd68c] text-[#0e0f12]" : "bg-[#f0616d] text-white") : "border border-white/15 text-slate-300"
                    }`}
                  >
                    {s} {cents(s === "yes" ? contract.yes : contract.no)}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="flex justify-between font-display text-[11px] font-bold tracking-normal text-slate-400">
                  Stake (points)
                  {balance !== null && <span className="normal-case tracking-normal text-slate-500">Balance {pts(balance)}</span>}
                </span>
                <input
                  inputMode="numeric"
                  value={stake}
                  onChange={(e) => setStake(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                  className="rounded-md border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-base text-white focus:border-[#f2b33d]/60 focus:outline-none"
                />
              </label>
              <div className="flex gap-2">
                {[50, 100, 250].map((v) => (
                  <button key={v} onClick={() => setStake(String(v))} className="flex-1 rounded border border-white/10 py-1.5 font-mono text-xs text-slate-300 hover:border-white/30">
                    {v}
                  </button>
                ))}
                {balance !== null && (
                  <button onClick={() => setStake(String(Math.floor(balance)))} className="flex-1 rounded border border-white/10 py-1.5 font-mono text-xs text-slate-300 hover:border-white/30">
                    Max
                  </button>
                )}
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                Pays <span className="font-mono text-white">{pts(payout)}</span> pts if {side === "yes" ? "" : "not "}
                <span className="text-slate-200">{contract.title}</span>. You can close early at the live price.
              </p>
              {account ? (
                <button
                  onClick={place}
                  disabled={busy || !tradable || stakeN < minStake || (balance !== null && stakeN > balance)}
                  className="flex items-center justify-center gap-2 rounded-md arcade-btn bg-[#f2b33d] py-3 font-display text-xs font-bold tracking-normal text-[#0e0f12] hover:bg-[#f7c766] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && <Loader2 size={15} className="animate-spin" />}
                  {tradable ? "Place pick" : "Market not tradable"}
                </button>
              ) : (
                <button onClick={onConnect} className="flex items-center justify-center gap-2 rounded-md arcade-btn bg-[#f2b33d] py-3 font-display text-xs font-bold tracking-normal text-[#0e0f12] hover:bg-[#f7c766]">
                  <Wallet size={15} /> Connect to pick
                </button>
              )}
              {notice && (
                <p role="status" className={`text-sm ${notice.tone === "ok" ? "text-[#3dd68c]" : "text-[#f58a93]"}`}>
                  {notice.text}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MyPicks({ account, data, onConnect, onChanged }: { account: string | null; data: PicksData | undefined; onConnect: () => void; onChanged: () => void }) {
  const [closing, setClosing] = useState<string | null>(null)
  const [err, setErr] = useState("")
  const p = data?.portfolio

  if (!account) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <h2 className="font-display text-sm font-bold tracking-normal text-white">Your picks</h2>
        <p className="text-sm leading-relaxed text-slate-400">Connect a wallet to get 1,000 free points and start calling markets.</p>
        <button onClick={onConnect} className="flex items-center gap-2 rounded-md border border-[#f2b33d]/50 px-3 py-2 font-display text-xs font-bold tracking-normal text-[#f2b33d]">
          <Wallet size={14} /> Connect wallet
        </button>
      </div>
    )
  }

  async function close(id: string) {
    if (!account) return
    setClosing(id)
    setErr("")
    try {
      const r = await picksAction(account, { action: "close", id })
      if (!r.ok) setErr(ERRORS[r.error] ?? "Couldn't close that pick.")
      onChanged()
    } catch (e) {
      setErr((e as Error).message || "Signature was cancelled.")
    } finally {
      setClosing(null)
    }
  }

  const open = p?.picks.filter((x) => !x.closedAt) ?? []
  const closed = p?.picks.filter((x) => x.closedAt) ?? []

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <h2 className="font-display text-sm font-bold tracking-normal text-white">Your picks</h2>
      {!p ? (
        <Loader2 size={16} className="animate-spin text-slate-400" aria-label="Loading" />
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {[
              ["Balance", pts(p.balance)],
              ["In play", pts(p.openValue)],
              ["Net", pts(p.netWorth)],
            ].map(([k, v], i) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-md bg-black/25 p-2.5">
                <dt className="font-display text-[10px] font-bold tracking-normal text-slate-400">{k}</dt>
                <dd className={`font-display text-base font-bold tabular-nums ${i === 2 ? (p.netWorth >= p.startingPoints ? "text-[#3dd68c]" : "text-[#f0616d]") : "text-white"}`}>{v}</dd>
              </div>
            ))}
          </dl>
          {err && <p role="status" className="text-xs text-[#f58a93]">{err}</p>}
          {open.length === 0 && closed.length === 0 && <p className="text-sm text-slate-400">No picks yet. Open a market and make your call.</p>}
          {open.length > 0 && (
            <ul className="flex flex-col divide-y divide-white/5">
              {open.map((x) => (
                <li key={x.id} className="flex flex-col gap-1.5 py-2.5">
                  <span className="truncate text-xs text-slate-400">{x.eventTitle}</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-slate-100">
                      <span className={`mr-1.5 font-display text-[11px] font-bold ${x.side === "yes" ? "text-[#3dd68c]" : "text-[#f0616d]"}`}>{x.side}</span>
                      {x.contractTitle}
                    </span>
                    {x.settling ? (
                      <span className="flex shrink-0 items-center gap-1 rounded bg-[#f2b33d]/10 px-2 py-1 font-display text-[10px] font-bold tracking-normal text-[#f2b33d]">
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Settling
                      </span>
                    ) : (
                      <button
                        onClick={() => close(x.id)}
                        disabled={closing !== null || x.currentPrice === null}
                        className="flex shrink-0 items-center gap-1 rounded border border-white/15 px-2 py-1 font-display text-[10px] font-bold tracking-normal text-slate-200 hover:border-white/40 disabled:opacity-40"
                      >
                        {closing === x.id && <Loader2 size={12} className="animate-spin" />} {x.venue === "fcm" ? "Sell" : "Close"}
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    {pts(x.stake)} @ {cents(x.entryPrice)} → {x.settling ? "at expiry" : x.currentPrice === null ? "—" : cents(x.currentPrice)}
                    {x.pnl !== null && <span className={`ml-2 ${x.pnl >= 0 ? "text-[#3dd68c]" : "text-[#f0616d]"}`}>{x.pnl >= 0 ? "+" : ""}{pts(x.pnl)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer font-display font-bold tracking-normal">Closed ({closed.length})</summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {closed.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span className="truncate">{x.side.toUpperCase()} {x.contractTitle}</span>
                    <span className={`shrink-0 font-mono ${(x.pnl ?? 0) >= 0 ? "text-[#3dd68c]" : "text-[#f0616d]"}`}>{(x.pnl ?? 0) >= 0 ? "+" : ""}{pts(x.pnl ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

export function PredictHub({ account, onConnect }: { account: string | null; onConnect: () => void }) {
  const [kind, setKind] = useState("")
  const [draft, setDraft] = useState("")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)

  const base = q ? `/api/predict?q=${encodeURIComponent(q)}` : `/api/predict?group=${kind}`
  const { data: pages, error, isLoading, size, setSize } = useSWRInfinite<{ events: PEvent[]; nextCursor: string | null }>(
    (i, prev) => (i === 0 ? base : prev?.nextCursor ? `${base}&cursor=${encodeURIComponent(prev.nextCursor)}` : null),
    fetcher,
    { refreshInterval: 30_000 },
  )
  const events = pages?.flatMap((p) => p.events) ?? []
  const hasMore = !!pages?.[pages.length - 1]?.nextCursor
  const loadingMore = size > (pages?.length ?? 0)

  const { data: picks, mutate } = useSWR<PicksData>(`/api/predict/picks${account ? `?wallet=${account.toLowerCase()}` : ""}`, fetcher, {
    refreshInterval: 30_000,
  })
  const balance = picks?.portfolio?.balance ?? null
  const minStake = picks?.minStake ?? 10

  const [hourly, setHourly] = useState<{ symbol: string; side: "yes" | "no" } | null>(null)
  const openEvent = (id: string) => {
    setHourly(null)
    setSelected(id)
  }
  const openHourly = (symbol: string, side: "yes" | "no") => {
    setSelected(null)
    setHourly({ symbol, side })
  }
  const closeTicket = () => {
    setSelected(null)
    setHourly(null)
  }

  const ticket = selected ? (
    <Ticket key={selected} eventId={selected} account={account} onConnect={onConnect} balance={balance} minStake={minStake} onPlaced={() => mutate()} onClose={closeTicket} />
  ) : hourly ? (
    <HourlyTicket
      key={hourly.symbol}
      symbol={hourly.symbol}
      side={hourly.side}
      account={account}
      onConnect={onConnect}
      balance={balance}
      minStake={minStake}
      onPlaced={() => mutate()}
      onClose={closeTicket}
    />
  ) : null

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="font-display text-xs font-bold tracking-normal text-[#f0616d]">Predict</span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Call the <span className="text-[#3dd68c]">future</span>
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300 text-pretty">
          Live odds on crypto, politics, economics and sport from Crypto.com prediction markets. Pick a side with free points, close early or ride it out, and climb the board.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setQ(draft.trim())
          }}
          className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 md:w-72"
          role="search"
        >
          <Search size={15} className="text-slate-400" aria-hidden="true" />
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (!e.target.value) setQ("")
            }}
            placeholder="Search markets"
            aria-label="Search markets"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </form>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => {
                setKind(c.kind)
                setQ("")
                setDraft("")
              }}
              aria-pressed={!q && kind === c.kind}
              className={`shrink-0 rounded-md px-3 py-2 font-display text-xs font-bold tracking-normal transition ${!q && kind === c.kind ? "bg-[#f0616d]/15 text-[#f2b33d]" : "bg-white/[0.04] text-slate-300 hover:text-white"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <HourlyBoard selected={hourly} onPick={openHourly} />
          {error && events.length === 0 && <p className="py-10 text-center text-sm text-[#f58a93]">Couldn&apos;t load markets. Retrying shortly.</p>}
          {isLoading && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-44 animate-pulse rounded-lg bg-white/[0.04]" />)}</div>}
          {!isLoading && !error && events.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No open markets here right now.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <EventCard key={e.id} event={e} active={selected === e.id} onOpen={() => openEvent(e.id)} />
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setSize(size + 1)}
              disabled={loadingMore}
              className="flex items-center justify-center gap-2 self-center rounded-md border border-white/15 px-5 py-2.5 font-display text-xs font-bold tracking-normal text-slate-200 hover:border-white/40 disabled:opacity-50"
            >
              {loadingMore && <Loader2 size={14} className="animate-spin" />} Load more
            </button>
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
          <div className="hidden lg:block">{ticket}</div>
          <MyPicks account={account} data={picks} onConnect={onConnect} onChanged={() => mutate()} />
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-normal text-white">
              <Trophy size={15} className="text-[#3dd68c]" aria-hidden="true" /> Top callers
            </h2>
            {!picks?.leaders.length ? (
              <p className="text-sm text-slate-400">Close a pick to get on the board.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {picks.leaders.map((l, i) => (
                  <li key={l.wallet} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-mono text-slate-300">
                      <span className="mr-2 font-display font-bold text-[#f2b33d]">{i + 1}</span>
                      {l.wallet}
                    </span>
                    <span className={`font-mono tabular-nums ${l.realized >= 0 ? "text-[#3dd68c]" : "text-[#f0616d]"}`}>{l.realized >= 0 ? "+" : ""}{pts(l.realized)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {ticket && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 lg:hidden" role="dialog" aria-modal="true" aria-label="Pick ticket" onClick={closeTicket}>
          <div className="max-h-[88dvh] w-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {ticket}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">

        Odds from Crypto.com prediction market data; crypto rounds use live Crypto.com FCM order books and settle against the Crypto.com Exchange spot close at expiry. Picks use free MCRO.FUN points only; no real funds are wagered or paid out.
      </p>
    </section>
  )
}
