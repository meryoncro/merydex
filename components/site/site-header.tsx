import Image from "next/image"
import { LaunchButton } from "./launch-button"

const links = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
]

export function SiteHeader({ appHref }: { appHref: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0816]/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="mcro.fun home">
          <Image src="/images/mcro-logo.png" alt="" width={32} height={32} className="rounded-md" />
          <span className="font-display text-lg font-bold tracking-tight text-white">
            MCRO<span className="text-[#29e6ff]">.FUN</span>
          </span>
        </a>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {links.map(l => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm text-slate-400 transition hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <LaunchButton href={appHref} size="sm" />
      </div>
    </header>
  )
}
