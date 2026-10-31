import { ShieldCheck } from "lucide-react"
import { LaunchButton } from "./launch-button"
import { SwapPreview } from "./swap-preview"

export function SiteHero({ appHref }: { appHref: string }) {
  return (
    <section id="top" className="mx-auto grid max-w-[1120px] items-center gap-12 px-5 pb-20 pt-14 md:pt-24 lg:grid-cols-[1.1fr_1fr] lg:px-8">
      <div className="flex flex-col items-start gap-6">
        <p className="text-sm text-slate-400">Built for the Cronos community</p>
        <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-balance sm:text-5xl lg:text-[56px]">
          The easy way to swap Cronos memecoins.
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-slate-400 text-pretty">
          Pick a token, see the price you&apos;ll get, and confirm in your wallet. We find the best route across Cronos DEXs so you don&apos;t have to.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <LaunchButton href={appHref} label="Start swapping" />
          <a href="#how" className="text-base font-medium text-slate-300 underline-offset-4 transition hover:text-white hover:underline">
            How it works
          </a>
        </div>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <ShieldCheck size={16} aria-hidden className="text-[#3dd68c]" />
          Non-custodial. Your keys never leave your wallet.
        </p>
      </div>
      <SwapPreview />
    </section>
  )
}
