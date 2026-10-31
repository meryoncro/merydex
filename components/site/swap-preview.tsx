import Image from "next/image"
import { ArrowDown, ChevronDown } from "lucide-react"

function TokenPill({ symbol, logo }: { symbol: string; logo?: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-sm font-semibold">
      {logo ? (
        <Image src={logo} alt="" width={24} height={24} className="h-6 w-6 rounded-full" />
      ) : (
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1c2a4a] text-[10px] font-bold text-white">
          {symbol.slice(0, 1)}
        </span>
      )}
      {symbol}
      <ChevronDown size={14} aria-hidden className="text-slate-500" />
    </span>
  )
}

export function SwapPreview() {
  return (
    <figure aria-label="Preview of the mcro.fun swap box" className="relative mx-auto w-full max-w-[420px]">
      <div className="arcade-panel rounded-2xl border border-white/15 bg-[#171230] p-3 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <span className="font-display text-base font-semibold">Swap</span>
          <span className="text-xs text-slate-500">Slippage 0.5%</span>
        </div>

        <div className="rounded-xl bg-[#0b0816] p-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>You pay</span>
            <span>Balance 2,480 CRO</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-display text-3xl font-semibold tabular-nums">500</span>
            <TokenPill symbol="CRO" />
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">≈ $49.20</div>
        </div>

        <div className="relative z-10 -my-3 flex justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border-4 border-[#171230] bg-[#241c45] text-slate-300">
            <ArrowDown size={16} aria-hidden />
          </span>
        </div>

        <div className="rounded-xl bg-[#0b0816] p-4">
          <div className="text-xs text-slate-500">You receive</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-display text-3xl font-semibold tabular-nums text-white">1.2M</span>
            <TokenPill symbol="MERY" logo="/images/mcro-logo.png" />
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">Best route via 2 pools</div>
        </div>

        <div className="mt-3 rounded-xl bg-[#29e6ff] py-3.5 text-center text-base font-semibold text-[#0b0816]">Swap</div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-slate-500">Example quote. Live prices in the app.</figcaption>
    </figure>
  )
}
