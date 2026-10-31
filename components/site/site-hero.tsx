import { ShieldCheck } from "lucide-react"
import { LaunchButton } from "./launch-button"
import { SwapPreview } from "./swap-preview"

export function SiteHero({ appHref }: { appHref: string }) {
  return (
    <section id="top" className="pixel-dots border-b-2 border-white/10">
      <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <div className="flex flex-col items-start gap-6">
          <span className="sticker -rotate-2 rounded-md bg-[#3dd68c] px-3 py-1 font-display text-sm font-bold text-[#0e0f12]">
            Player 1 ready
          </span>
          <h1 className="font-display text-4xl font-bold leading-[1.05] text-balance sm:text-5xl lg:text-6xl">
            Swap Cronos memecoins like it&apos;s{" "}
            <span className="text-[#f2b33d]">a high score.</span>
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-slate-300 text-pretty">
            Pick a token, see exactly what you&apos;ll get, and confirm in your wallet. We hunt down the best route across Cronos DEXs. You just press the button.
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <LaunchButton href={appHref} label="Press start" />
            <a href="#how" className="font-display text-base text-slate-300 underline-offset-4 transition hover:text-white hover:underline">
              How to play
            </a>
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <ShieldCheck size={16} aria-hidden className="text-[#3dd68c]" />
            Non-custodial. Your keys never leave your wallet.
          </p>
        </div>
        <div className="relative">
          <span className="sticker absolute -right-2 -top-4 z-10 rotate-6 rounded-md bg-[#f2b33d] px-3 py-1 font-display text-sm font-bold text-[#0e0f12]">
            1 coin = 1 swap
          </span>
          <SwapPreview />
        </div>
      </div>
    </section>
  )
}
