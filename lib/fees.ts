// WolfSwap partner fee: transferred on-chain to FEE_COLLECTOR during each swap.
// feeAmount must be sent to WolfSwap as an integer string in bps.
export const FEE_COLLECTOR =
  process.env.MERYDEX_FEE_COLLECTOR || "0x30Cd87c2B4B402b12d1640e4d458E83a73524408"

const parsedFeeBps = Number.parseInt(process.env.MERYDEX_FEE_BPS || "100", 10)
export const FEE_BPS = Number.isFinite(parsedFeeBps) && parsedFeeBps >= 0 && parsedFeeBps <= 1000 ? parsedFeeBps : 100

// Obsidian direct-API partner fee, paid to FEE_COLLECTOR from gross output.
// Obsidian caps it at 100 bps and adds its own 0.4% on top.
const parsedObsidianBps = Number.parseInt(process.env.MERYDEX_OBSIDIAN_FEE_BPS || "80", 10)
export const OBSIDIAN_FEE_BPS =
  Number.isInteger(parsedObsidianBps) && parsedObsidianBps >= 0 && parsedObsidianBps <= 100 ? parsedObsidianBps : 80
