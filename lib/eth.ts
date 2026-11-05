import type { Token } from "@/lib/tokens"

export const ETH_CHAIN_ID = 1
export const ETH_EXPLORER = "https://etherscan.io"
export const ETH_RPC_URLS = ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://cloudflare-eth.com"]
export const ETH_NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000"
export const ETH_GAS_RESERVE = 0.003

const assetLogo = (address: string) =>
  `https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/assets/${address}/logo.png`

const erc20 = (address: string, symbol: string, name: string, decimals: number, color: string): Token => ({
  address,
  symbol,
  name,
  decimals,
  color,
  logoURI: assetLogo(address),
})

export const ETH_TOKENS: Token[] = [
  {
    address: ETH_NATIVE_ADDRESS,
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    color: "#627eea",
    isNative: true,
    logoURI: "https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/ethereum/info/logo.png",
  },
  erc20("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USDC", "USD Coin", 6, "#2775ca"),
  erc20("0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", "Tether USD", 6, "#26a17b"),
  erc20("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", "Wrapped Ether", 18, "#627eea"),
  erc20("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "WBTC", "Wrapped BTC", 8, "#f09242"),
  erc20("0x6B175474E89094C44Da98b954EedeAC495271d0F", "DAI", "Dai Stablecoin", 18, "#f5ac37"),
  erc20("0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b", "CRO", "Cronos (ERC-20)", 8, "#002d74"),
  erc20("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "UNI", "Uniswap", 18, "#ff007a"),
  erc20("0x514910771AF9Ca656af840dff83E8264EcF986CA", "LINK", "Chainlink", 18, "#2a5ada"),
  erc20("0x6982508145454Ce325dDbE47a25d4ec3d2311933", "PEPE", "Pepe", 18, "#3d8130"),
  erc20("0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", "SHIB", "Shiba Inu", 18, "#f00500"),
]

export const findEthToken = (address: unknown): Token | undefined =>
  typeof address === "string" ? ETH_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase()) : undefined
