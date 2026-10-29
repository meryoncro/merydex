import { BrowserProvider, Contract, formatEther } from "ethers"

// Mistery on Cro (MERY) — the ERC721 collection this tab renders.
// https://app.ebisusbay.com/collection/cronos/mistery-on-cro
export const MERY_COLLECTION = "0x561ffeca612917ccb8900993e9637a9e4a047e76"
export const MERY_SLUG = "mistery-on-cro"

// Collections allowed into the Arena. Holders of either can fight each other.
export const ARENA_COLLECTIONS = {
  mery: { address: MERY_COLLECTION, short: "MERY", label: "Mistery on Cro", slug: MERY_SLUG, color: "#a855f7" },
  lions: { address: "0xea1635a0e9344d933df42c0fd494d39bce865dc4", short: "LION", label: "Loaded Lions", slug: "loaded-lions", color: "#f5b82e" },
} as const
export type ArenaCollection = keyof typeof ARENA_COLLECTIONS
export const isArenaCollection = (v: unknown): v is ArenaCollection =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(ARENA_COLLECTIONS, v)

// Ebisu's Bay marketplace contracts on Cronos mainnet.
// TradeShip ("ship") is what fillOrders lives on; Port is the listing/approval target.
export const SHIP_ADDRESS = "0x523d6f30c4aaca133daad97ee2a0c48235bff137"
export const PORT_ADDRESS = "0x7a3cdb2364f92369a602cae81167d0679087e6a3"
export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000"
export const CRONOS_CHAIN_ID = 25

export const SHIP_ABI = [
  "function fillOrders((address offerer,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offerings,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] considerations,uint8 orderType,uint256 startAt,uint256 endAt,uint256 salt)[] _orders,(uint256 expire,uint256 feeAmount,address feeToken,address filler,bytes[] sigs) _approval,bytes _serverSig) payable",
]

export const ERC721_ABI = [
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
]

// ---- Shapes we actually consume (upstream carries more keys) ----
export interface Collection {
  address: string
  name: string
  slug: string
  totalSupply?: string
  holders?: string
  is1155: boolean
  verification?: { verified: boolean }
  stats: { total: Record<string, string> }
  metadata: Record<string, unknown>
}

export interface Listing {
  listingId: string
  nftId: string
  price: string
  currency: string
  seller: string
  nft: { name?: string; image?: string; rank?: number } & Record<string, unknown>
}

export interface WalletNft {
  nftId: string
  nftAddress: string
  name?: string
  image?: string
  rank?: number | null
  offer: Record<string, unknown>
  market: Record<string, unknown>
  [k: string]: unknown
}

interface OfferItem {
  itemType: number
  token: string
  identifierOrCriteria: string
  startAmount: string
  endAmount: string
}
interface Order {
  offerer: string
  offerings: OfferItem[]
  considerations: OfferItem[]
  orderType: number
  startAt: number
  endAt: number
  salt: string
}
interface ValidatorData {
  expire: number
  feeAmount: string
  feeToken: string
  filler: string
  sigs: string[]
  signature: string
  orderData: Order[]
}

const j = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || "Request failed")
  return body
}

export async function fetchCollection(): Promise<Collection | null> {
  const { collection } = await j("/api/nft?action=collection")
  return collection
}

export async function fetchListings(page = 1): Promise<{ listings: Listing[]; totalCount: number; totalPages: number }> {
  const body = await j(`/api/nft?action=listings&page=${page}`)
  return { listings: body.listings ?? [], totalCount: body.totalCount ?? 0, totalPages: body.totalPages ?? 1 }
}

export async function fetchWalletNfts(wallet: string, collection: ArenaCollection = "mery"): Promise<WalletNft[]> {
  const body = await j(`/api/nft?action=wallet&wallet=${wallet}&collection=${collection}`)
  return body.nfts ?? []
}

export type ArenaNft = WalletNft & { collection: ArenaCollection }

// Every Arena-eligible NFT the wallet holds, across all whitelisted collections.
export async function fetchArenaNfts(wallet: string): Promise<ArenaNft[]> {
  const keys = Object.keys(ARENA_COLLECTIONS) as ArenaCollection[]
  const results = await Promise.allSettled(keys.map(k => fetchWalletNfts(wallet, k)))
  if (results.every(r => r.status === "rejected")) throw new Error("Could not load NFTs")
  return results.flatMap((r, i) => (r.status === "fulfilled" ? r.value.map(n => ({ ...n, collection: keys[i] })) : []))
}

export const arenaNftName = (nft: { name?: string; nftId?: string; collection?: string }) => {
  if (nft.name) return nft.name
  const short = isArenaCollection(nft.collection) ? ARENA_COLLECTIONS[nft.collection].short : "MERY"
  return nft.nftId ? `${short} #${nft.nftId}` : "—"
}

const getEthereum = () => {
  const eth = (window as Window & { ethereum?: unknown }).ethereum
  if (!eth) throw new Error("No compatible wallet detected. Install MetaMask or a Cronos wallet.")
  return eth as ConstructorParameters<typeof BrowserProvider>[0]
}

async function ensureCronos(provider: BrowserProvider) {
  const net = await provider.getNetwork()
  if (Number(net.chainId) !== CRONOS_CHAIN_ID) {
    throw new Error("Switch your wallet to Cronos Mainnet (chain 25) to trade MERY.")
  }
}

// Full documented purchase flow: validate the listing(s) server-side to get the
// signed Approval + Order tuples, then fill on-chain via the ship contract.
export async function buyListing(listingId: string, buyer: string): Promise<string> {
  const provider = new BrowserProvider(getEthereum())
  await ensureCronos(provider)
  const signer = await provider.getSigner()

  const res = await fetch(`/api/nft?action=validate&address=${buyer}&listingIds=${encodeURIComponent(listingId)}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || "Listing is no longer available")
  const data = body.data as ValidatorData

  // msg.value = server-pinned fee + every NATIVE-priced order's amount.
  // Never recompute the fee — take feeAmount verbatim from the validator.
  const value = data.orderData.reduce(
    (sum, o) => (o.considerations[0]?.itemType === 0 ? sum + BigInt(o.considerations[0].startAmount) : sum),
    BigInt(data.feeAmount),
  )

  const balance = await provider.getBalance(buyer)
  if (balance < value) {
    throw new Error(
      `Not enough CRO: this NFT costs ${croFormat(formatEther(value))} CRO including fees, but your wallet has ${croFormat(formatEther(balance))} CRO.`,
    )
  }

  const ship = new Contract(SHIP_ADDRESS, SHIP_ABI, signer)
  const approval = {
    expire: data.expire,
    feeAmount: data.feeAmount,
    feeToken: data.feeToken,
    filler: data.filler,
    sigs: data.sigs,
  }
  // Simulate first — fills revert if the seller moved/delisted after validation.
  try {
    await ship.fillOrders.staticCall(data.orderData, approval, data.signature, { value })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (/rejected|denied/i.test(msg)) throw e
    throw new Error("This listing can't be filled right now — it may have just sold or been delisted. Refresh and try again.")
  }
  const tx = await ship.fillOrders(data.orderData, approval, data.signature, { value })
  await tx.wait()
  return tx.hash as string
}

// Standard ERC721 marketplace approval — required once before a wallet can list.
// Returns true if the wallet already has (or just granted) approval.
export async function ensureListingApproval(owner: string): Promise<boolean> {
  const provider = new BrowserProvider(getEthereum())
  await ensureCronos(provider)
  const signer = await provider.getSigner()
  const nft = new Contract(MERY_COLLECTION, ERC721_ABI, signer)
  const approved: boolean = await nft.isApprovedForAll(owner, PORT_ADDRESS)
  if (approved) return true
  const tx = await nft.setApprovalForAll(PORT_ADDRESS, true)
  await tx.wait()
  return true
}

export const listingUrl = (tokenId: string) =>
  `https://app.ebisusbay.com/collection/cronos/${MERY_SLUG}/${tokenId}`

export const croFormat = (v?: string | number) => {
  const n = Number(v ?? 0)
  if (!isFinite(n)) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 2 })
}
