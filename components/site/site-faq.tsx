import { ChevronDown } from "lucide-react"

const faqs = [
  {
    q: "Does mcro.fun hold my funds?",
    a: "No. You connect your own wallet and sign every transaction yourself. We never hold your funds or keys.",
  },
  {
    q: "What does it cost to trade?",
    a: "Swaps carry a 1% platform fee on top of normal network gas. The quote shows what you'll receive before you sign.",
  },
  {
    q: "How do referrals work?",
    a: "Every wallet gets an invite link in the Referral tab. When someone swaps after joining with your link, you earn 30% of the platform fee and can request payouts from the app.",
  },
  {
    q: "Are predictions real money?",
    a: "No. Predictions use free paper points priced from live Crypto.com data, so you can compete on the leaderboard without risking anything.",
  },
  {
    q: "Which networks are supported?",
    a: "Cronos mainnet today. Ethereum is planned once our swap routing supports it.",
  },
]

export function SiteFaq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto grid max-w-[1120px] gap-12 px-5 py-20 lg:grid-cols-[320px_1fr] lg:px-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-balance">Common questions</h2>
        <div className="flex flex-col divide-y divide-white/10 border-y border-white/10">
          {faqs.map(f => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium text-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown size={18} aria-hidden className="shrink-0 text-slate-500 transition group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
