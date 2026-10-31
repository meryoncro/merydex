import { LaunchButton } from "./launch-button"

export function SiteFooter({ appHref }: { appHref: string }) {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-[1120px] flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center lg:px-8">
        <div className="flex flex-col gap-1">
          <span className="font-display text-base font-bold tracking-tight text-white">
            mcro<span className="text-[#f2b33d]">.fun</span>
          </span>
          <span className="text-sm text-slate-500">Powered by Cronos Network and Crypto.com data</span>
        </div>
        <LaunchButton href={appHref} size="sm" />
      </div>
    </footer>
  )
}
