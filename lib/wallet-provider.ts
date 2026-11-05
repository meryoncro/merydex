"use client"

import type EthereumProviderType from "@walletconnect/ethereum-provider"
import { ACTIVE_CHAIN } from "@/lib/chains"
import { cronosRpcUrls } from "@/lib/rpc-urls"
import { ETH_CHAIN_ID, ETH_RPC_URLS } from "@/lib/eth"

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

export type WalletKind = "injected" | "walletconnect"

// WalletConnect project IDs are public (they ship in the browser bundle); the env var can override it.
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "f4fd8fe14701cef72a246397050a3678"
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
    optionalChains: [chainId, ETH_CHAIN_ID],
    rpcMap: { [chainId]: cronosRpcUrls(chainId)[0], [ETH_CHAIN_ID]: ETH_RPC_URLS[0] },
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

const CHAIN_NAMES: Record<number, string> = { 1: "Ethereum", 25: "Cronos", 338: "Cronos Testnet" }

/**
 * Makes sure the connected wallet is on `chainId` before a transaction is sent,
 * asking the wallet to switch (and add Cronos if it doesn't know it yet).
 */
export async function ensureChain(chainId: number): Promise<void> {
  const provider = getEthereum()
  if (!provider) throw new Error("Connect a wallet first.")
  const current = Number.parseInt(String(await provider.request({ method: "eth_chainId" })), 16)
  if (current === chainId) return
  const hexId = `0x${chainId.toString(16)}`
  const name = CHAIN_NAMES[chainId] ?? `chain ${chainId}`
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] })
  } catch (error) {
    const code = (error as { code?: number })?.code
    if (code === 4001) throw new Error(`Switch to ${name} was cancelled.`)
    const isCronos = chainId === 25 || chainId === 338
    if (code === 4902 && isCronos) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hexId,
          chainName: name,
          nativeCurrency: { name: "Cronos", symbol: "CRO", decimals: 18 },
          rpcUrls: cronosRpcUrls(chainId).slice(0, 1),
          blockExplorerUrls: [chainId === 25 ? "https://explorer.cronos.org" : "https://explorer.cronos.org/testnet"],
        }],
      })
    } else {
      throw new Error(`Switch your wallet to ${name} to continue.`)
    }
  }
  const after = Number.parseInt(String(await provider.request({ method: "eth_chainId" })), 16)
  if (after !== chainId) throw new Error(`Switch your wallet to ${name} to continue.`)
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
