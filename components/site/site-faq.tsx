import { Plus } from "lucide-react"

const faqs = [
  {
    q: "Is MCRO.FUN custodial?",
    a: "No. You connect your own wallet and sign every transaction yourself. MCRO.FUN never holds your funds or keys.",
  },
  {
    q: "What does it cost to trade?",
    a: "Swaps carry a 1% platform fee on top of normal network gas. Quotes show the full amount before you sign.",
  },
  {
    q: "How does the referral program work?",
    a: "Every wallet gets a unique invite code in the Referral tab. When someone joins with your link, you earn 30% of the platform fee on their swaps and can request payouts from the app.",
  },
  {
    q: "Are prediction markets real money?",
    a: "No. Predictions use free paper points priced from live Crypto.com data, so you can compete on the leaderboard without risking funds.",
  },
  {
    q: "Which networks are supported?",
    a: "Cronos mainnet today. Ethereum is on the roadmap once our swap routing supports it.",
  },
]

export function SiteFaq() {
  return (
    <section id="faq" className="mx-auto flex max-w-[860px] scroll-mt-20 flex-col gap-8 px-5 py-20 lg:px-8">
      <div className="flex flex-col gap-3">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-[#c6ff3a]">FAQ</p>
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-balance sm:text-4xl">Before you insert a coin</h2>
      </div>
      <div className="flex flex-col gap-3">
        {faqs.map(f => (
          <details key={f.q} className="group rounded-xl border border-white/10 bg-[#130a1f]/80 open:border-[#22e4ff]/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-display text-base font-bold uppercase tracking-wide [&::-webkit-details-marker]:hidden">
              {f.q}
              <Plus size={18} aria-hidden className="shrink-0 text-[#22e4ff] transition group-open:rotate-45" />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-slate-300">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
