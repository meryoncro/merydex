"use client"

/* eslint-disable @next/next/no-img-element */

export type SwapNetwork = "cronos" | "ethereum"

type NetworkSwitchProps = {
  network: SwapNetwork
  onSelect: (network: SwapNetwork) => void
}

const OPTIONS: { id: SwapNetwork; label: string; short: string; icon: string; iconClass: string }[] = [
  { id: "cronos", label: "Cronos Mainnet", short: "Cronos", icon: "/chains/cronos.png", iconClass: "h-5 w-5 rounded-full" },
  { id: "ethereum", label: "Ethereum Mainnet", short: "ETH", icon: "/chains/ethereum.svg", iconClass: "h-5 w-5" },
]

export function NetworkSwitch({ network, onSelect }: NetworkSwitchProps) {
  return (
    <div role="radiogroup" aria-label="Network" className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
      {OPTIONS.map((o) => {
        const active = network === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => onSelect(o.id)}
            className={`flex items-center gap-2 rounded px-2 py-1.5 transition ${active ? "bg-[#3dff9a]/10 ring-1 ring-[#3dff9a]/40" : "opacity-60 hover:opacity-100"}`}
          >
            <img src={o.icon} alt="" width={20} height={20} className={o.iconClass} />
            <span className={`hidden font-display text-xs font-bold tracking-normal lg:inline ${active ? "text-[#3dff9a]" : "text-slate-300"}`}>{o.short}</span>
          </button>
        )
      })}
    </div>
  )
}
