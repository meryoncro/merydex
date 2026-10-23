"use client"

import { BrowserProvider } from "ethers"
import { chatSignInMessage } from "@/lib/chat"

export const sessionKey = (address: string) => `merydex-chat:${address.toLowerCase()}`

export const storedSession = (address: string) => sessionStorage.getItem(sessionKey(address))

export const clearSession = (address: string) => sessionStorage.removeItem(sessionKey(address))

/** Returns the existing wallet session (shared with chat) or asks the wallet for one signature. */
export async function ensureSession(address: string): Promise<string> {
  const existing = storedSession(address)
  if (existing) return existing
  const ethereum = (window as Window & { ethereum?: unknown }).ethereum
  if (!ethereum) throw new Error("Install a compatible wallet first.")
  const signer = await new BrowserProvider(ethereum as ConstructorParameters<typeof BrowserProvider>[0]).getSigner()
  const signerAddress = await signer.getAddress()
  const issuedAt = new Date().toISOString()
  const signature = await signer.signMessage(chatSignInMessage(signerAddress, issuedAt))
  const res = await fetch("/api/chat/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: signerAddress, issuedAt, signature }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? "Sign-in failed")
  sessionStorage.setItem(sessionKey(json.address), json.token)
  return json.token as string
}
