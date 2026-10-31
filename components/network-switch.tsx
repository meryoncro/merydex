"use client"

/* eslint-disable @next/next/no-img-element */

type NetworkSwitchProps = {
  onUnavailable: (message: string) => void
}

// WolfSwap's routing API only accepts Cronos (networkId 25) today; Ethereum
// requests are rejected with "networkId is not supported".
const ETH_UNAVAILABLE =
  "Ethereum swaps aren't live yet. Swap routing currently supports Cronos only. We'll switch Ethereum on as soon as it's available."

export function NetworkSwitch({ onUnavailable }: NetworkSwitchProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked="true"
        aria-label="Cronos Mainnet"
        title="Cronos Mainnet"
        className="flex items-center gap-2 rounded bg-[#d6ff2b]/10 px-2 py-1.5 ring-1 ring-[#d6ff2b]/40 transition"
      >
        <img src="/chains/cronos.png" alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
        <span className="hidden font-display text-xs font-bold uppercase tracking-wider text-[#d6ff2b] lg:inline">Cronos</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked="false"
        aria-label="Ethereum (coming soon)"
        title="Ethereum - coming soon"
        onClick={() => onUnavailable(ETH_UNAVAILABLE)}
        className="flex items-center gap-2 rounded px-2 py-1.5 opacity-50 grayscale transition hover:opacity-90 hover:grayscale-0 focus-visible:opacity-90 focus-visible:grayscale-0"
      >
        <img src="/chains/ethereum.svg" alt="" width={20} height={20} className="h-5 w-5" />
        <span className="hidden font-display text-xs font-bold uppercase tracking-wider text-slate-300 lg:inline">ETH</span>
      </button>
    </div>
  )
}
