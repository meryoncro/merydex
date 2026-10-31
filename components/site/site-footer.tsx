import { LaunchButton } from "./launch-button"

export function SiteFooter({ appHref }: { appHref: string }) {
  return (
    <footer className="relative z-10 border-t border-[#22e4ff]/15">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center lg:px-8">
        <div className="flex flex-col gap-1">
          <span className="font-display text-lg font-bold tracking-wider text-[#ff2d95] neon-pink">MCRO.FUN</span>
          <span className="font-display text-xs uppercase tracking-wider text-slate-400">The Cronos memecoin arcade · Non-custodial</span>
          <span className="text-xs text-slate-500">Powered by Cronos Network and Crypto.com data</span>
        </div>
        <LaunchButton href={appHref} size="sm" />
      </div>
    </footer>
  )
}
