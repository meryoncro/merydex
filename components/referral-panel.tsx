"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Check, Copy, Gift, Loader2, Share2, Wallet } from "lucide-react"
import { clearSession, ensureSession } from "@/lib/wallet-session"

const PENDING_KEY = "merydex-ref"
const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

interface ReferralData {
  code: string
  shareBps: number
  feeBps: number
  minClaimUsd: number
  referredBy: string | null
  earnings: {
    referees: number
    activeReferees: number
    volumeUsd: number
    earnedUsd: number
    paidUsd: number
    pendingUsd: number
    claimableUsd: number
  }
  referees: { wallet: string; joinedAt: string; trades: number; volumeUsd: number; rewardUsd: number }[]
  payouts: { id: string; usdAmount: number; status: string; payoutTx: string | null; createdAt: string }[]
}

const ERRORS: Record<string, string> = {
  invalid_code: "That invite code doesn't exist.",
  self_referral: "You can't use your own invite code.",
  already_referred: "This wallet is already linked to an inviter.",
  existing_trader: "Invites only apply to wallets that haven't traded on MCRO.FUN yet.",
  below_minimum: "You need more earnings before requesting a payout.",
  pending_exists: "You already have a payout request being processed.",
  rate_limited: "Too many requests. Try again in a minute.",
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2 })

const fetcher = async (url: string): Promise<ReferralData> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Couldn't load referral stats")
  return res.json()
}

/** POSTs with the wallet session, re-signing once if the stored session expired. */
async function referralAction(account: string, payload: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureSession(account)
    const res = await fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (res.status === 401 && attempt === 0) {
      clearSession(account)
      continue
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false as const, error: String(json.error ?? "server_error") }
    return { ok: true as const, data: json }
  }
  return { ok: false as const, error: "unauthorized" }
}

const readPending = () => (typeof window === "undefined" ? null : localStorage.getItem(PENDING_KEY))

/**
 * Stores `?ref=CODE` from the URL and, once a wallet connects, links it with one signature.
 * Mounted at the page root so invites work whichever tab the visitor lands on.
 */
export function useReferralCapture(account: string | null) {
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const ref = url.searchParams.get("ref")?.trim().toUpperCase()
    if (!ref) return
    if (CODE_RE.test(ref)) localStorage.setItem(PENDING_KEY, ref)
    url.searchParams.delete("ref")
    window.history.replaceState(null, "", url.toString())
  }, [])

  useEffect(() => {
    const code = readPending()
    if (!account || !code || attempted.current === account) return
    attempted.current = account
    referralAction(account, { action: "bind", code })
      .then((result) => {
        // Anything but a transient failure is final, so stop asking this wallet to sign.
        if (result.ok || result.error !== "server_error") localStorage.removeItem(PENDING_KEY)
      })
      .catch(() => {
        // Signature rejected: keep the invite so the Referral tab can offer it again.
      })
  }, [account])
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="flex shrink-0 items-center gap-2 rounded-md bg-[#f2b33d] px-3.5 py-2.5 font-display text-xs font-bold tracking-normal text-[#0e0f12] transition hover:bg-[#f7c766]"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "lime" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <span className="font-display text-[11px] font-bold tracking-normal text-slate-400">{label}</span>
      <span className={`font-display text-2xl font-bold tabular-nums ${tone === "lime" ? "text-[#3dd68c]" : "text-white"}`}>{value}</span>
    </div>
  )
}

export function ReferralPanel({ account, onConnect }: { account: string | null; onConnect: () => void }) {
  const { data, error, isLoading, mutate } = useSWR(account ? `/api/referral?wallet=${account.toLowerCase()}` : null, fetcher, {
    refreshInterval: 60_000,
  })
  const [pendingCode, setPendingCode] = useState<string | null>(readPending)
  const [busy, setBusy] = useState<"claim" | "bind" | null>(null)
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  const sharePct = data ? data.shareBps / 100 : 30
  const link = data && typeof window !== "undefined" ? `${window.location.origin}/?ref=${data.code}` : ""

  async function run(kind: "claim" | "bind") {
    if (!account) return
    setBusy(kind)
    setNotice(null)
    try {
      const result = await referralAction(account, kind === "bind" ? { action: "bind", code: pendingCode } : { action: "claim" })
      if (kind === "bind" && (result.ok || result.error !== "server_error")) {
        localStorage.removeItem(PENDING_KEY)
        setPendingCode(null)
      }
      if (result.ok) {
        setNotice({
          tone: "ok",
          text: kind === "bind" ? "Invite accepted. Welcome to MCRO.FUN." : `Payout of ${usd(result.data.usdAmount)} requested.`,
        })
      } else {
        setNotice({ tone: "error", text: ERRORS[result.error] ?? "Something went wrong. Try again." })
      }
      await mutate()
    } catch (err) {
      setNotice({ tone: "error", text: (err as Error).message || "Signature was cancelled." })
    } finally {
      setBusy(null)
    }
  }

  const header = (
    <div className="mb-8 flex flex-col gap-3">
      <span className="font-display text-xs font-bold tracking-normal text-[#f0616d]">Invite & earn</span>
      <h1 className="font-display text-4xl font-bold tracking-tight text-balance">
        Earn <span className="text-[#3dd68c]">{sharePct}%</span> of every fee
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-300 text-pretty">
        Share your code. Every time a friend you invite swaps on MCRO.FUN, {sharePct}% of the platform fee they pay is credited to you,
        for as long as they trade.
      </p>
    </div>
  )

  if (!account) {
    return (
      <section className="mx-auto max-w-4xl">
        {header}
        <div className="flex flex-col items-center gap-4 rounded-lg border border-white/10 bg-white/[0.03] px-6 py-14 text-center">
          <Gift size={28} className="text-[#f2b33d]" aria-hidden="true" />
          <p className="text-sm text-slate-300">Connect your wallet to get your personal invite code.</p>
          <button
            onClick={onConnect}
            className="flex items-center gap-2 rounded-md bg-[#f2b33d] px-4 py-2.5 font-display text-xs font-bold tracking-normal text-[#0e0f12] hover:bg-[#f7c766]"
          >
            <Wallet size={15} /> Connect wallet
          </button>
        </div>
      </section>
    )
  }

  const earnings = data?.earnings
  const canClaim = !!data && !!earnings && earnings.claimableUsd >= data.minClaimUsd && earnings.pendingUsd === 0

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      {header}

      {pendingCode && data && !data.referredBy && (
        <div className="flex flex-col gap-3 rounded-lg border border-[#f0616d]/40 bg-[#f0616d]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-200">
            You were invited with code <span className="font-display font-bold tracking-normal text-white">{pendingCode}</span>. Sign once to accept.
          </p>
          <button
            onClick={() => run("bind")}
            disabled={busy !== null}
            className="flex w-fit items-center gap-2 rounded-md bg-[#f0616d] px-4 py-2.5 font-display text-xs font-bold tracking-normal text-white hover:bg-[#f0616d] disabled:opacity-60"
          >
            {busy === "bind" && <Loader2 size={15} className="animate-spin" />} Accept invite
          </button>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={`rounded-md border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-[#3dd68c]/40 bg-[#3dd68c]/10 text-[#3dd68c]" : "border-[#f0616d]/40 bg-[#f0616d]/10 text-[#f58a93]"}`}
        >
          {notice.text}
        </p>
      )}

      {error && <p className="text-sm text-[#f58a93]">Couldn&apos;t load your referral stats. Retrying shortly.</p>}

      {isLoading || !data || !earnings ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Loading your invite code
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-5 rounded-lg border border-[#f2b33d]/30 bg-[#f2b33d]/[0.05] p-5 shadow-sm">
            <div className="flex flex-col gap-2">
              <span className="font-display text-[11px] font-bold tracking-normal text-slate-400">Your invite code</span>
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-4xl font-bold tracking-normal text-[#f2b33d]">{data.code}</span>
                <CopyButton value={data.code} label="invite code" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-display text-[11px] font-bold tracking-normal text-slate-400">Invite link</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={link}
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-sm text-slate-200"
                />
                <div className="flex gap-2">
                  <CopyButton value={link} label="invite link" />
                  <a
                    href={`https://x.com/intent/post?text=${encodeURIComponent(`Swap on Cronos with me on MCRO.FUN. Trade $MERY for 2x score.`)}&url=${encodeURIComponent(link)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-2 rounded-md border border-white/15 px-3.5 py-2.5 font-display text-xs font-bold tracking-normal text-slate-200 hover:border-[#f2b33d]/50 hover:text-white"
                  >
                    <Share2 size={15} /> Share
                  </a>
                </div>
              </div>
            </div>
            {data.referredBy && <p className="text-xs text-slate-400">You were invited by {data.referredBy}.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Friends invited" value={String(earnings.referees)} />
            <Stat label="Trading friends" value={String(earnings.activeReferees)} />
            <Stat label="Friends' volume" value={usd(earnings.volumeUsd)} />
            <Stat label="Total earned" value={usd(earnings.earnedUsd)} tone="lime" />
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-display text-[11px] font-bold tracking-normal text-slate-400">Claimable now</span>
              <span className="font-display text-3xl font-bold tabular-nums text-[#3dd68c]">{usd(earnings.claimableUsd)}</span>
              <span className="text-xs text-slate-400">
                Paid {usd(earnings.paidUsd)}
                {earnings.pendingUsd > 0 && ` · ${usd(earnings.pendingUsd)} being processed`} · Minimum payout {usd(data.minClaimUsd)}
              </span>
            </div>
            <button
              onClick={() => run("claim")}
              disabled={!canClaim || busy !== null}
              className="flex w-fit items-center gap-2 rounded-md bg-[#3dd68c] px-5 py-3 font-display text-xs font-bold tracking-normal text-[#0e0f12] hover:bg-[#6ee7a8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "claim" && <Loader2 size={15} className="animate-spin" />} Request payout
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h2 className="font-display text-sm font-bold tracking-normal text-white">Your friends</h2>
              {data.referees.length === 0 ? (
                <p className="text-sm leading-relaxed text-slate-400">No friends yet. Share your link and their trades will show up here.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-white/5">
                  {data.referees.map((r) => (
                    <li key={r.wallet + r.joinedAt} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="font-mono text-slate-200">{r.wallet}</span>
                      <span className="text-right text-xs text-slate-400">
                        {r.trades} trades · {usd(r.volumeUsd)}
                        <span className="ml-2 font-display font-bold text-[#3dd68c]">+{usd(r.rewardUsd)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5">
              <h2 className="font-display text-sm font-bold tracking-normal text-white">How it works</h2>
              <ol className="flex flex-col gap-3 text-sm leading-relaxed text-slate-300">
                <li><span className="font-display font-bold text-[#f2b33d]">1.</span> Share your code or link with a friend who hasn&apos;t traded here yet.</li>
                <li><span className="font-display font-bold text-[#f2b33d]">2.</span> They connect their wallet and sign once to accept your invite.</li>
                <li>
                  <span className="font-display font-bold text-[#f2b33d]">3.</span> On every swap they pay a {data.feeBps / 100}% platform fee, and {sharePct}% of
                  that fee is credited to you, worked out from the swap&apos;s on-chain value.
                </li>
                <li><span className="font-display font-bold text-[#f2b33d]">4.</span> Request a payout once you reach {usd(data.minClaimUsd)}. Payouts are sent to your wallet.</li>
              </ol>
              {data.payouts.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5 border-t border-white/5 pt-3 text-xs text-slate-400">
                  {data.payouts.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span>{new Date(p.createdAt).toLocaleDateString()} · {usd(p.usdAmount)}</span>
                      <span className={p.status === "paid" ? "text-[#3dd68c]" : p.status === "rejected" ? "text-[#f0616d]" : "text-slate-300"}>{p.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
