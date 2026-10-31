import { randomInt } from "node:crypto"
import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { FEE_BPS } from "@/lib/fees"

/** Share of the platform fee paid to the referrer, in bps of the fee (3000 = 30%). */
export const REFERRAL_SHARE_BPS = 3000
export const MIN_CLAIM_USD = 5

// No I, O, 0 or 1 so codes survive being read aloud or typed from a screenshot.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8
export const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/

type Db = Pick<PoolClient, "query">

const newCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")

/** The wallet's permanent referral code, created on first request. */
export async function codeFor(wallet: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await pool.query<{ code: string }>("SELECT code FROM merydex_referral_codes WHERE wallet = $1", [wallet])
    if (existing.rows[0]) return existing.rows[0].code
    try {
      const inserted = await pool.query<{ code: string }>(
        "INSERT INTO merydex_referral_codes (wallet, code) VALUES ($1, $2) ON CONFLICT (wallet) DO NOTHING RETURNING code",
        [wallet, newCode()],
      )
      if (inserted.rows[0]) return inserted.rows[0].code
    } catch (err) {
      // 23505 = the random code collided with another wallet's; draw again.
      if ((err as { code?: string }).code !== "23505") throw err
    }
  }
  throw new Error("could_not_allocate_code")
}

export type BindResult = "ok" | "invalid_code" | "self_referral" | "already_referred" | "existing_trader"

/**
 * Links a new wallet to the owner of `code`. Only wallets that have never
 * traded can be referred, so nobody can claim credit for existing users.
 */
export async function bindReferral(referee: string, code: string): Promise<BindResult> {
  if (!CODE_RE.test(code)) return "invalid_code"
  const owner = await pool.query<{ wallet: string }>("SELECT wallet FROM merydex_referral_codes WHERE code = $1", [code])
  const referrer = owner.rows[0]?.wallet
  if (!referrer) return "invalid_code"
  if (referrer === referee) return "self_referral"

  const bound = await pool.query("SELECT 1 FROM merydex_referrals WHERE referee = $1", [referee])
  if (bound.rowCount) return "already_referred"
  const traded = await pool.query("SELECT 1 FROM merydex_trades WHERE wallet = $1 LIMIT 1", [referee])
  if (traded.rowCount) return "existing_trader"

  const inserted = await pool.query(
    "INSERT INTO merydex_referrals (referee, referrer) VALUES ($1, $2) ON CONFLICT (referee) DO NOTHING",
    [referee, referrer],
  )
  return inserted.rowCount ? "ok" : "already_referred"
}

const toCents = (usd: number) => Math.floor(usd * 100) / 100

/** Referrer reward for `volumeUsd` of referred trading: fee share of the platform fee. */
export const rewardFor = (volumeUsd: number) => volumeUsd * (FEE_BPS / 10_000) * (REFERRAL_SHARE_BPS / 10_000)

export interface ReferralEarnings {
  referees: number
  activeReferees: number
  volumeUsd: number
  earnedUsd: number
  paidUsd: number
  pendingUsd: number
  claimableUsd: number
}

/** Rewards are derived from verified trades, counting only those made after the referral link. */
export async function earningsFor(wallet: string, db: Db = pool): Promise<ReferralEarnings> {
  const totals = await db.query<{ referees: number; active: number; volume: number }>(
    `SELECT COUNT(DISTINCT r.referee)::int AS referees,
            COUNT(DISTINCT t.wallet)::int AS active,
            COALESCE(SUM(t.usd_value), 0)::float8 AS volume
       FROM merydex_referrals r
       LEFT JOIN merydex_trades t ON t.wallet = r.referee AND t.created_at >= r.created_at
      WHERE r.referrer = $1`,
    [wallet],
  )
  const payouts = await db.query<{ status: string; total: number }>(
    `SELECT status, COALESCE(SUM(usd_amount), 0)::float8 AS total
       FROM merydex_referral_payouts WHERE wallet = $1 AND status <> 'rejected' GROUP BY status`,
    [wallet],
  )
  const { referees, active, volume } = totals.rows[0]
  const paidUsd = payouts.rows.find((p) => p.status === "paid")?.total ?? 0
  const pendingUsd = payouts.rows.find((p) => p.status === "pending")?.total ?? 0
  const earnedUsd = rewardFor(volume)
  return {
    referees,
    activeReferees: active,
    volumeUsd: volume,
    earnedUsd,
    paidUsd,
    pendingUsd,
    claimableUsd: Math.max(0, toCents(earnedUsd - paidUsd - pendingUsd)),
  }
}

export interface RefereeRow {
  wallet: string
  joinedAt: string
  trades: number
  volumeUsd: number
  rewardUsd: number
}

export async function refereesOf(wallet: string): Promise<RefereeRow[]> {
  const { rows } = await pool.query<{ referee: string; created_at: Date; trades: number; volume: number }>(
    `SELECT r.referee, r.created_at, COUNT(t.id)::int AS trades, COALESCE(SUM(t.usd_value), 0)::float8 AS volume
       FROM merydex_referrals r
       LEFT JOIN merydex_trades t ON t.wallet = r.referee AND t.created_at >= r.created_at
      WHERE r.referrer = $1
      GROUP BY r.referee, r.created_at
      ORDER BY volume DESC, r.created_at DESC
      LIMIT 25`,
    [wallet],
  )
  return rows.map((r) => ({
    wallet: `${r.referee.slice(0, 6)}…${r.referee.slice(-4)}`,
    joinedAt: r.created_at.toISOString(),
    trades: r.trades,
    volumeUsd: r.volume,
    rewardUsd: rewardFor(r.volume),
  }))
}

export async function referrerOf(wallet: string): Promise<string | null> {
  const { rows } = await pool.query<{ referrer: string }>("SELECT referrer FROM merydex_referrals WHERE referee = $1", [wallet])
  const referrer = rows[0]?.referrer
  return referrer ? `${referrer.slice(0, 6)}…${referrer.slice(-4)}` : null
}

export async function payoutsOf(wallet: string) {
  const { rows } = await pool.query<{ id: string; usd_amount: string; status: string; payout_tx: string | null; created_at: Date }>(
    "SELECT id, usd_amount, status, payout_tx, created_at FROM merydex_referral_payouts WHERE wallet = $1 ORDER BY created_at DESC LIMIT 10",
    [wallet],
  )
  return rows.map((p) => ({
    id: p.id,
    usdAmount: Number(p.usd_amount),
    status: p.status,
    payoutTx: p.payout_tx,
    createdAt: p.created_at.toISOString(),
  }))
}

export type ClaimResult = { ok: true; usdAmount: number } | { ok: false; error: "below_minimum" | "pending_exists" }

/** Files a payout request for everything claimable. Serialised per wallet so double-clicks can't double-claim. */
export async function requestPayout(wallet: string): Promise<ClaimResult> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`referral-payout:${wallet}`])
    const earnings = await earningsFor(wallet, client)
    if (earnings.pendingUsd > 0) {
      await client.query("ROLLBACK")
      return { ok: false, error: "pending_exists" }
    }
    if (earnings.claimableUsd < MIN_CLAIM_USD) {
      await client.query("ROLLBACK")
      return { ok: false, error: "below_minimum" }
    }
    await client.query("INSERT INTO merydex_referral_payouts (wallet, usd_amount) VALUES ($1, $2)", [wallet, earnings.claimableUsd])
    await client.query("COMMIT")
    return { ok: true, usdAmount: earnings.claimableUsd }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
