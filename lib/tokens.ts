export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  color: string;
  // Native gas coin (CRO). Routed and priced through its wrapped counterpart.
  isNative?: boolean;
  // For native tokens: the wrapped ERC-20 address used for quoting/routing.
  wrapped?: string;
  // Tokens with no VVS liquidity route through a specific DEX router
  // (e.g. Obsidian Finance) for both quoting and execution.
  dex?: { name: string; router: string };
  // Explicit logo URL (e.g. imported from the WolfSwap whitelist). When set it
  // takes priority over the DexScreener CDN fallback.
  logoURI?: string | null;
  // True for tokens imported from an external whitelist rather than curated.
  imported?: boolean;
}

// Obsidian Finance v2 router on Cronos mainnet. Holds the WCRO/TROLL pool
// (factory 0xCd2E5cC83681d62BEb066Ad0a2ec94Bf301570C9) that VVS doesn't index.
export const OBSIDIAN_ROUTER = "0x8EbC409998ef75661A4C464ff9bbb490586F954a";

// Sentinel address used to identify the native gas coin in the token list.
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Correct Cronos mainnet addresses (verified against VVS docs)
export const TOKENS: Token[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: "CRO",
    name: "Cronos",
    decimals: 18,
    color: "#1199FA",
    isNative: true,
    wrapped: "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23",
  },
  {
    address: "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23",
    symbol: "WCRO",
    name: "Wrapped CRO",
    decimals: 18,
    color: "#1199FA",
  },
  {
    address: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    color: "#2775CA",
  },
  {
    address: "0x66e428c3f67a68767596461f7ee3ec71a3a3bab5",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    color: "#26A17B",
  },
  {
    address: "0x062E66477Faf610fFaFe27FCADC3c7E6390d4E9c",
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    color: "#F7931A",
  },
  {
    address: "0xe44Fd7fCb2b1581822D0c862B68222998a0c299a",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    color: "#627EEA",
  },
  {
    address: "0x2d03bece6747adc00e1a131bba1469c15fd11e03",
    symbol: "VVS",
    name: "VVS Finance",
    decimals: 18,
    color: "#E94560",
  },
  {
    address: "0xDD73dEa10ABC2Bff99c60882EC5b2B81Bb1Dc5B2",
    symbol: "TONIC",
    name: "Tectonic",
    decimals: 18,
    color: "#00D4AA",
  },
  {
    address: "0x3b41B27E74Dd366CE27cB389dc7877D4e1516d4d",
    symbol: "MERY",
    name: "Mistery",
    decimals: 18,
    color: "#f2b84b",
  },
  {
    address: "0xcCcCcCcCdbEC186DC426F8B5628AF94737dF0E60",
    symbol: "CAW",
    name: "crow with knife",
    decimals: 18,
    color: "#d8d8d8",
  },
  {
    address: "0x71b60B37f030D0cff949855b9D0405915057B116",
    symbol: "CRONUS",
    name: "Cronus",
    decimals: 18,
    color: "#8f7cff",
  },
  {
    address: "0x1036b2fc96feaedb36397a0a6eb51b34adbb0fd9",
    symbol: "212",
    name: "212",
    decimals: 18,
    color: "#ff725e",
  },
  {
    address: "0x0d0b4a6fc6e7f5635c2ff38de75af2e96d6d6804",
    symbol: "PACK",
    name: "Wolfies",
    decimals: 18,
    color: "#57c7ff",
  },
  {
    address: "0x0AEBa21655185583367f19D0C882dfc654C6Dd54",
    symbol: "OBS",
    name: "Obsidian",
    decimals: 18,
    color: "#00a3ff",
  },
  {
    address: "0xBF19931EBF1bc9fb85820aa8f6Ba29030A9b9A27",
    symbol: "ULTCAT",
    name: "Ultra Cat",
    decimals: 18,
    color: "#9b5de5",
  },
  {
    address: "0x679f6863a653251C8C215e77205A7058b5bF676a",
    symbol: "TROLL",
    name: "Troll",
    decimals: 9,
    color: "#2ecc71",
    dex: { name: "Obsidian", router: OBSIDIAN_ROUTER },
  },
  {
    address: "0xF2001B145b43032AAF5Ee2884e456CCd805F677D",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    color: "#F5AC37",
  },
  {
    address: "0xB888d8Dd1733d72681b30c00ee76BDE93ae7aa93",
    symbol: "ATOM",
    name: "Cosmos Hub",
    decimals: 6,
    color: "#2E3148",
  },
  {
    address: "0xbED48612BC69fA1CaB67052b42a95FB30C1bcFee",
    symbol: "SHIB",
    name: "Shiba Inu",
    decimals: 18,
    color: "#F00500",
  },
  {
    address: "0x9D8c68F185A04314DDC8B8216732455e8dbb7E45",
    symbol: "LION",
    name: "CronosLion",
    decimals: 18,
    color: "#C9A227",
  },
  {
    address: "0x7a7c9db510aB29A2FC362a4c34260BEcB5cE3446",
    symbol: "CDCETH",
    name: "Crypto.com Staked ETH",
    decimals: 18,
    color: "#103F68",
  },
  {
    address: "0x9Fae23A2700FEeCd5b93e43fDBc03c76AA7C08A6",
    symbol: "LCRO",
    name: "Liquid CRO",
    decimals: 18,
    color: "#5CB3FF",
  },
];

// DexScreener serves a token logo CDN keyed by lowercase contract address.
// Native CRO borrows its wrapped (WCRO) logo; anything without a real contract
// address falls back to the colored badge.
export const getTokenLogoUrl = (token: Token): string | null => {
  if (token.logoURI) return token.logoURI;
  const addr = token.isNative && token.wrapped ? token.wrapped : token.address;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return `https://dd.dexscreener.com/ds-data/tokens/cronos/${addr.toLowerCase()}.png?size=lg`;
};

// The address to use when quoting/routing a token through a DEX. Native CRO
// routes through its wrapped ERC-20 (WCRO); every other token uses its own.
export const getRoutingAddress = (token: Token): string => {
  return token.isNative && token.wrapped ? token.wrapped : token.address;
};

// When either side of a swap declares a custom DEX (no VVS liquidity), the
// whole route uses that router. Otherwise callers fall back to VVS.
export const getPairDex = (
  from: Token,
  to: Token,
): { name: string; router: string } | null => {
  return from.dex ?? to.dex ?? null;
};

export const getTokenByAddress = (address: string): Token | undefined => {
  return TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
};

export const getTokenBySymbol = (symbol: string): Token | undefined => {
  return TOKENS.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
};
