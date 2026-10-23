// WolfSwap partner fee: transferred on-chain to FEE_COLLECTOR during each swap.
// feeAmount must be sent to WolfSwap as an integer string in bps.
export const FEE_COLLECTOR =
  process.env.MERYDEX_FEE_COLLECTOR || "0xcBB9205492416995DC11A1ac5895B3F022db7859"

const parsedFeeBps = Number.parseInt(process.env.MERYDEX_FEE_BPS || "100", 10)
export const FEE_BPS = Number.isFinite(parsedFeeBps) && parsedFeeBps >= 0 && parsedFeeBps <= 1000 ? parsedFeeBps : 100
