import Image from "next/image"
import { LaunchButton } from "./launch-button"

const ticker = ["Best-route swaps", "Pro terminal", "Prediction markets", "Hourly crypto rounds", "PvP arena", "NFT gallery", "Recurring buys", "30% referral share", "Non-custodial"]

export function SiteHero({ appHref }: { appHref: string }) {
  return (
    <section id="top" className="relative">
      <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-5 pb-14 pt-12 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:px-8">
        <div className="flex flex-col items-start gap-6">
          <p className="flex items-center gap-2 rounded-full border border-[#c6ff3a]/40 bg-[#c6ff3a]/10 px-3 py-1 font-display text-xs font-bold uppercase tracking-widest text-[#c6ff3a]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#c6ff3a] animate-arcade-blink" />
            Live on Cronos
          </p>
          <h1 className="font-display text-4xl font-bold uppercase leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Trade memecoins <span className="text-[#22e4ff] neon-cyan">like an arcade game</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-300 text-pretty sm:text-lg">
            MCRO.FUN is a neon trading arcade for the Cronos ecosystem. Swap memecoins on the best route, read real exchange order books, call prediction markets and battle other players, all from your own wallet.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <LaunchButton href={appHref} label="Insert coin" />
            <a href="#features" className="rounded-md border border-[#22e4ff]/40 px-6 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-[#22e4ff] transition hover:bg-[#22e4ff]/10">
              See what&apos;s inside
            </a>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-[#ff2d95]/30 glow-pink">
          <Image
            src="/images/site-hero.png"
            alt="Neon arcade cabinet with a rising trading chart on its screen"
            width={1200}
            height={900}
            priority
            className="h-auto w-full object-cover"
          />
          <p aria-hidden className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-[#0a0510]/80 px-4 py-1.5 font-display text-sm font-bold uppercase tracking-[0.3em] text-[#c6ff3a] neon-lime animate-arcade-blink">
            Insert coin
          </p>
        </div>
      </div>
      <div className="overflow-hidden border-y border-[#22e4ff]/15 bg-[#130a1f]/80 py-3" aria-label="Platform features">
        <ul className="flex w-max gap-10 animate-marquee">
          {[...ticker, ...ticker].map((t, i) => (
            <li key={i} aria-hidden={i >= ticker.length} className="flex items-center gap-10 whitespace-nowrap font-display text-xs font-bold uppercase tracking-widest text-slate-300">
              {t}
              <span aria-hidden className="text-[#ff2d95]">{"//"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
