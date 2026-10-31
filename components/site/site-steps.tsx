import Image from "next/image"
import { LaunchButton } from "./launch-button"

const steps = [
  { title: "Open the app", body: "Go to app.mcro.fun. This page never asks for your wallet." },
  { title: "Connect your wallet", body: "Any Cronos wallet works. You sign once to start, and your keys stay with you." },
  { title: "Swap", body: "Choose the tokens, check the quote and confirm. It settles on-chain in seconds." },
]

export function SiteSteps({ appHref }: { appHref: string }) {
  return (
    <section id="how" className="scroll-mt-20 border-t border-white/10 bg-[#171230]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-12 px-5 py-20 lg:px-8">
        <h2 className="font-display text-4xl font-bold text-balance">How to play</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="arcade-panel flex flex-col gap-3 rounded-xl border border-white/15 bg-[#0b0816] p-6">
              <span className="font-display text-lg font-bold text-[#29e6ff]">Level {i + 1}</span>
              <h3 className="text-lg font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="arcade-panel flex flex-col items-start justify-between gap-6 rounded-2xl border border-[#29e6ff]/40 bg-[#0b0816] p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex items-center gap-4">
            <Image src="/images/mcro-logo.png" alt="" width={48} height={48} className="h-12 w-12 rounded-lg" />
            <p className="font-display text-2xl font-bold text-balance">Insert coin to continue</p>
          </div>
          <LaunchButton href={appHref} label="Play now" />
        </div>
      </div>
    </section>
  )
}
