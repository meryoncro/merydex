import type { Metadata } from "next"
import { headers } from "next/headers"
import { SiteFaq } from "@/components/site/site-faq"
import { SiteFeatures } from "@/components/site/site-features"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { SiteHero } from "@/components/site/site-hero"
import { SiteSteps } from "@/components/site/site-steps"
import { APP_URL, SITE_URL, isSiteHost } from "@/lib/domains"

export const metadata: Metadata = {
  title: "MCRO.FUN - The Cronos Memecoin Arcade",
  description:
    "MCRO.FUN turns Cronos trading into an arcade: best-route memecoin swaps, a pro market terminal, prediction markets, PvP arena and a 30% referral program. Non-custodial.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "MCRO.FUN - The Cronos Memecoin Arcade",
    description: "Swap, predict and battle on Cronos. Insert coin at app.mcro.fun.",
    url: SITE_URL,
    siteName: "MCRO.FUN",
    images: [{ url: "/images/site-hero.png", width: 1200, height: 900, alt: "Neon arcade cabinet showing a rising trading chart" }],
    type: "website",
  },
}

export default async function SitePage() {
  const host = (await headers()).get("host")
  // Outside production the dApp lives at "/" on the same host.
  const appHref = isSiteHost(host) ? APP_URL : "/"

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0510] text-slate-100">
      <div aria-hidden className="pointer-events-none fixed inset-0 arcade-grid opacity-40" />
      <SiteHeader appHref={appHref} />
      <main className="relative z-10">
        <SiteHero appHref={appHref} />
        <SiteFeatures />
        <SiteSteps appHref={appHref} />
        <SiteFaq />
      </main>
      <SiteFooter appHref={appHref} />
    </div>
  )
}
