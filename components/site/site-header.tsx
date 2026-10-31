import Image from "next/image"
import { LaunchButton } from "./launch-button"

const links = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
]

export function SiteHeader({ appHref }: { appHref: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#22e4ff]/15 bg-[#0a0510]/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="MCRO.FUN home">
          <Image src="/images/mcro-logo.png" alt="" width={36} height={36} className="rounded-md" />
          <span className="font-display text-lg font-bold tracking-wider text-[#ff2d95] neon-pink">MCRO.FUN</span>
        </a>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {links.map(l => (
            <a key={l.href} href={l.href} className="rounded-md px-3.5 py-2 font-display text-xs font-bold uppercase tracking-wider text-slate-300 transition hover:text-[#22e4ff]">
              {l.label}
            </a>
          ))}
        </nav>
        <LaunchButton href={appHref} size="sm" />
      </div>
    </header>
  )
}
