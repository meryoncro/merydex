import { ArrowLeftRight, CandlestickChart, Gift, Image as ImageIcon, Swords, Target } from "lucide-react"

const features = [
  {
    icon: ArrowLeftRight,
    title: "Smart swaps",
    body: "Every trade is routed for the best price across Cronos DEXs, with slippage you control.",
    tone: "text-[#22e4ff]",
    span: "md:col-span-2",
  },
  {
    icon: CandlestickChart,
    title: "Pro terminal",
    body: "Live Crypto.com Exchange candles, order book and trades side by side with the on-chain CRO price.",
    tone: "text-[#ff2d95]",
    span: "",
  },
  {
    icon: Target,
    title: "Prediction markets",
    body: "Call real-world events and hourly BTC, ETH, XRP and SOL rounds priced from live Crypto.com order books. Paper points, no real money.",
    tone: "text-[#c6ff3a]",
    span: "",
  },
  {
    icon: Swords,
    title: "PvP arena",
    body: "Challenge other wallets head to head and climb the leaderboard while you chat with the room.",
    tone: "text-[#ff2d95]",
    span: "",
  },
  {
    icon: ImageIcon,
    title: "NFT gallery",
    body: "See the Cronos NFTs your wallet holds right next to your tokens.",
    tone: "text-[#c6ff3a]",
    span: "",
  },
  {
    icon: Gift,
    title: "Earn 30% of fees",
    body: "Every wallet gets its own invite code. Share it and earn 30% of the platform fee on every swap your referrals make.",
    tone: "text-[#c6ff3a]",
    span: "md:col-span-3",
  },
]

export function SiteFeatures() {
  return (
    <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-20 lg:px-8">
      <div className="mb-10 flex max-w-2xl flex-col gap-3">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-[#ff2d95]">Game modes</p>
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-balance sm:text-4xl">One cabinet, every way to play the market</h2>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {features.map(f => (
          <li key={f.title} className={`flex flex-col gap-4 rounded-xl border border-white/10 bg-[#130a1f]/80 p-6 transition hover:border-[#22e4ff]/40 ${f.span}`}>
            <f.icon size={24} className={f.tone} aria-hidden />
            <h3 className="font-display text-lg font-bold uppercase tracking-wide">{f.title}</h3>
            <p className="text-sm leading-relaxed text-slate-300">{f.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
