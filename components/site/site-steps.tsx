import { LaunchButton } from "./launch-button"

const steps = [
  { title: "Open the app", body: "Head to app.mcro.fun. The info site never asks for your wallet." },
  { title: "Connect your wallet", body: "Use any Cronos-compatible wallet and sign once to start your session. Your keys never leave your wallet." },
  { title: "Pick a mode and play", body: "Swap, predict, battle or invite friends. Every trade is signed by you and settles on-chain." },
]

export function SiteSteps({ appHref }: { appHref: string }) {
  return (
    <section id="how" className="scroll-mt-20 border-y border-[#22e4ff]/15 bg-[#130a1f]/60">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-5 py-20 lg:px-8">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="font-display text-xs font-bold uppercase tracking-widest text-[#22e4ff]">How it works</p>
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-balance sm:text-4xl">Three steps to player one</h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0a0510]/70 p-6">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-[#ff2d95]">Level {i + 1}</span>
              <h3 className="font-display text-lg font-bold uppercase tracking-wide">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[#ff2d95]/30 bg-[#ff2d95]/10 p-6 sm:flex-row sm:items-center">
          <p className="font-display text-lg font-bold uppercase tracking-wide text-balance">Ready? The cabinet is already on.</p>
          <LaunchButton href={appHref} />
        </div>
      </div>
    </section>
  )
}
