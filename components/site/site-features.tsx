import { ArrowLeftRight, CandlestickChart, Gift, Image as ImageIcon, Swords, Target } from "lucide-react"

const features = [
  {
    icon: ArrowLeftRight,
    title: "Swaps that find the best price",
    body: "Every trade is routed across Cronos DEXs, and you set your own slippage.",
  },
  {
    icon: CandlestickChart,
    title: "A proper trading view",
    body: "Crypto.com Exchange candles, order book and recent trades next to the on-chain CRO price.",
  },
  {
    icon: Target,
    title: "Predictions for fun",
    body: "Call hourly BTC, ETH, XRP and SOL moves with free paper points. No real money involved.",
  },
  {
    icon: Swords,
    title: "NFT battles",
    body: "Bring a MERY NFT, challenge another wallet and chat with the room while you play.",
  },
  {
    icon: ImageIcon,
    title: "Your NFTs in one place",
    body: "See the Cronos NFTs you hold next to your token balances.",
  },
  {
    icon: Gift,
    title: "30% back on referrals",
    body: "Share your invite link and earn 30% of the platform fee on your friends' swaps.",
  },
]

export function SiteFeatures() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-white/10">
      <div className="mx-auto grid max-w-[1120px] gap-12 px-5 py-20 lg:grid-cols-[320px_1fr] lg:px-8">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl font-bold tracking-tight text-balance">Everything in one app</h2>
          <p className="text-base leading-relaxed text-slate-400">
            Swapping comes first. The rest is there when you want it.
          </p>
        </div>
        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {features.map(f => (
            <li key={f.title} className="flex gap-4">
              <f.icon size={20} aria-hidden className="mt-1 shrink-0 text-[#f2b33d]" />
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
