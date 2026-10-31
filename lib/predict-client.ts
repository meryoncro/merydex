import { clearSession, ensureSession } from "@/lib/wallet-session"

export const PICK_ERRORS: Record<string, string> = {
  insufficient_points: "Not enough points for that stake.",
  too_many_open: "You have the maximum number of open picks. Close one first.",
  market_closed: "This market is no longer open.",
  round_closed: "This round just closed. The next round is live.",
  settling: "This round has ended and is settling at the expiry price.",
  price_unavailable: "No live price on that side right now. Try again.",
  invalid_pick: "Check your stake and try again.",
  rate_limited: "Too many requests. Try again in a minute.",
  not_found: "That pick is already closed.",
}

export const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Prediction data unavailable")
  return res.json()
}

export const pts = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })
export const cents = (p: number) => `${Math.round(p * 100)}¢`

export function usd(n: number) {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
  return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 5 })}`
}

export async function picksAction(account: string, payload: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureSession(account)
    const res = await fetch("/api/predict/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    if (res.status === 401 && attempt === 0) {
      clearSession(account)
      continue
    }
    const json = await res.json().catch(() => ({}))
    return res.ok ? { ok: true as const } : { ok: false as const, error: String(json.error ?? "server_error") }
  }
  return { ok: false as const, error: "unauthorized" }
}
