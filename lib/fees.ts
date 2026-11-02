// WolfSwap partner fee: transferred on-chain to FEE_COLLECTOR during each swap.
// feeAmount must be sent to WolfSwap as an integer string in bps.
export const FEE_COLLECTOR =
  process.env.MERYDEX_FEE_COLLECTOR || "0x30Cd87c2B4B402b12d1640e4d458E83a73524408"

const parsedFeeBps = Number.parseInt(process.env.MERYDEX_FEE_BPS || "100", 10)
export const FEE_BPS = Number.isFinite(parsedFeeBps) && parsedFeeBps >= 0 && parsedFeeBps <= 1000 ? parsedFeeBps : 100
