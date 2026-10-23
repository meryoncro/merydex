import type { ArenaCollection } from "@/lib/ebisus"

export type ArenaMode = "coin" | "rps"
export type RpsMove = "rock" | "paper" | "scissors"
export const RPS_MOVES: RpsMove[] = ["rock", "paper", "scissors"]

export interface NftRef {
  nftId: string
  name?: string
  image?: string
  collection?: ArenaCollection
}

export interface ArenaFighter {
  wallet: string
  nft: NftRef
  // Only present once the match is resolved — moves stay hidden while waiting.
  move?: RpsMove | null
}

export interface ArenaMatch {
  id: string
  status: "waiting" | "resolved"
  mode: ArenaMode
  p1: ArenaFighter
  p2: ArenaFighter | null
  winner: string | null
  createdAt: string
  matchedAt: string | null
}

export interface ArenaStats {
  battles: number
  battles24h: number
  inQueue: number
  players: number
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/arena", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || "Arena request failed")
  return data
}

export async function joinArena(wallet: string, nft: NftRef, mode: ArenaMode = "coin", move?: RpsMove): Promise<ArenaMatch> {
  const data = await post({ action: "join", wallet, nft, mode, move })
  return data.match
}

export async function leaveArena(matchId: string, wallet: string): Promise<void> {
  await post({ action: "leave", matchId, wallet })
}

export async function getMatch(matchId: string): Promise<ArenaMatch | null> {
  const res = await fetch(`/api/arena?action=status&matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" })
  if (!res.ok) return null
  const data = await res.json()
  return data.match ?? null
}

export async function getArenaStats(): Promise<ArenaStats> {
  const res = await fetch("/api/arena?action=stats", { cache: "no-store" })
  const data = await res.json()
  return data.stats as ArenaStats
}

export async function getArenaHistory(wallet: string): Promise<ArenaMatch[]> {
  const res = await fetch(`/api/arena?action=history&wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" })
  const data = await res.json()
  return (data.matches ?? []) as ArenaMatch[]
}

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "")
