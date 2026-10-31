const items = [
  "Best route across Cronos DEXs",
  "Non-custodial",
  "Hourly predictions",
  "NFT battles",
  "30% referral rewards",
  "Powered by Cronos network",
  "Crypto.com data",
]

export function SiteTicker() {
  const loop = [...items, ...items]
  return (
    <div className="overflow-hidden border-y-2 border-[#0b0816] bg-[#29e6ff] py-2.5 text-[#0b0816]" aria-label="Highlights">
      <ul className="flex w-max animate-marquee gap-8 whitespace-nowrap font-display text-base font-bold motion-reduce:animate-none">
        {loop.map((item, i) => (
          <li key={i} aria-hidden={i >= items.length} className="flex items-center gap-8">
            {item}
            <span aria-hidden className="h-2 w-2 bg-[#0b0816]" />
          </li>
        ))}
      </ul>
    </div>
  )
}
