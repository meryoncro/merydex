"use client"

import type EthereumProviderType from "@walletconnect/ethereum-provider"
import { ACTIVE_CHAIN } from "@/lib/chains"
import { cronosRpcUrls } from "@/lib/rpc-urls"

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

export type WalletKind = "injected" | "walletconnect"

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ""
export const walletConnectEnabled = WALLETCONNECT_PROJECT_ID.length > 0

let active: Eip1193Provider | null = null
let activeKind: WalletKind | null = null
let wcProvider: EthereumProviderType | null = null

export const injectedProvider = (): Eip1193Provider | undefined =>
  typeof window === "undefined" ? undefined : ((window as Window & { ethereum?: unknown }).ethereum as Eip1193Provider | undefined)

/** The provider of the wallet the user connected, falling back to an injected browser wallet. */
export const getEthereum = (): Eip1193Provider | undefined => active ?? injectedProvider()

export const getWalletKind = () => activeKind

async function getWalletConnect(): Promise<EthereumProviderType> {
  if (wcProvider) return wcProvider
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider")
  const chainId = ACTIVE_CHAIN.chainIdNumber
  wcProvider = await EthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    optionalChains: [chainId],
    rpcMap: { [chainId]: cronosRpcUrls(chainId)[0] },
    showQrModal: true,
    metadata: {
      name: "MCRO.FUN",
      description: "Cronos Arcade — swap Cronos memecoins",
      url: window.location.origin,
      icons: [`${window.location.origin}/apple-icon.png`],
    },
  })
  return wcProvider
}

/** Opens the chosen wallet and returns the connected address. */
export async function connectWallet(kind: WalletKind): Promise<string> {
  if (kind === "walletconnect") {
    if (!walletConnectEnabled) throw new Error("WalletConnect is not configured yet.")
    const wc = await getWalletConnect()
    if (!wc.session) await wc.connect()
    const accounts = wc.accounts
    if (!accounts?.length) throw new Error("No account returned by the wallet.")
    active = wc as unknown as Eip1193Provider
    activeKind = "walletconnect"
    return accounts[0]
  }
  const injected = injectedProvider()
  if (!injected) throw new Error("No browser wallet found. Use WalletConnect to connect a mobile wallet.")
  const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts?.length) throw new Error("No account returned by the wallet.")
  active = injected
  activeKind = "injected"
  return accounts[0]
}

export async function disconnectWallet() {
  if (activeKind === "walletconnect" && wcProvider) {
    try { await wcProvider.disconnect() } catch { /* session already gone */ }
  }
  active = null
  activeKind = null
}

/** Subscribes to account changes on the active wallet; returns an unsubscribe function. */
export function onWalletAccountChange(handler: (account: string | null) => void): () => void {
  const provider = active
  if (!provider?.on) return () => {}
  const onAccounts = (...args: unknown[]) => {
    const accounts = args[0] as string[] | undefined
    handler(accounts?.[0] ?? null)
  }
  const onDisconnect = () => {
    active = null
    activeKind = null
    handler(null)
  }
  provider.on("accountsChanged", onAccounts)
  provider.on("disconnect", onDisconnect)
  return () => {
    provider.removeListener?.("accountsChanged", onAccounts)
    provider.removeListener?.("disconnect", onDisconnect)
  }
}
