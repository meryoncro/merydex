export const NETWORK_MODE = (process.env.NEXT_PUBLIC_NETWORK_MODE || "mainnet") as "mainnet" | "testnet";

export const CHAIN_CONFIG = {
  mainnet: {
    chainId: "0x19",
    chainIdNumber: 25,
    chainName: "Cronos Mainnet",
    rpcUrl: "https://evm.cronos.org",
    explorer: "https://cronoscan.com",
    router: "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae",
  },
  testnet: {
    chainId: "0x152",
    chainIdNumber: 338,
    chainName: "Cronos Testnet",
    rpcUrl: "https://evm-t3.cronos.org",
    explorer: "https://explorer.cronos.org/testnet",
    router: "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae",
  },
};

export const ACTIVE_CHAIN = CHAIN_CONFIG[NETWORK_MODE];
export const CRONOS_CHAIN_ID = ACTIVE_CHAIN.chainId;
export const CRONOS_RPC = ACTIVE_CHAIN.rpcUrl;
export const VVS_ROUTER_V2 = ACTIVE_CHAIN.router;

// Constants
export const MAX_SLIPPAGE = 5; // hard cap in %
export const DEFAULT_SLIPPAGE = 0.5; // default in %
export const QUOTE_STALE_MS = 15000;
export const REFRESH_INTERVAL = 60000;
export const GAS_PRICE_MULTIPLIER = 1.1;
export const PRICE_IMPACT_WARNING = 3; // warn if > 3%
