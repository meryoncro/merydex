import Image from "next/image"
import { LaunchButton } from "./launch-button"

const steps = [
  { title: "Open the app", body: "Go to app.mcro.fun. This page never asks for your wallet." },
  { title: "Connect your wallet", body: "Any Cronos wallet works. You sign once to start, and your keys stay with you." },
  { title: "Swap", body: "Choose the tokens, check the quote and confirm. It settles on-chain in seconds." },
]

export function SiteSteps({ appHref }: { appHref: string }) {
  return (
    <section id="how" className="scroll-mt-20 border-t border-white/10 bg-[#16181d]">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-12 px-5 py-20 lg:px-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-balance">How it works</h2>
        <ol className="grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 border-t border-white/10 pt-5">
              <span className="text-sm tabular-nums text-[#f2b33d]">Step {i + 1}</span>
              <h3 className="text-lg font-semibold text-white">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-[#0e0f12] p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex items-center gap-4">
            <Image src="/images/mcro-logo.png" alt="" width={48} height={48} className="h-12 w-12 rounded-lg" />
            <p className="font-display text-xl font-semibold text-balance">Ready when you are.</p>
          </div>
          <LaunchButton href={appHref} label="Open app" />
        </div>
      </div>
    </section>
  )
}
