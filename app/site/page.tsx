import type { Metadata } from "next"
import { headers } from "next/headers"
import { SiteFaq } from "@/components/site/site-faq"
import { SiteFeatures } from "@/components/site/site-features"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { SiteHero } from "@/components/site/site-hero"
import { SiteSteps } from "@/components/site/site-steps"
import { SiteTicker } from "@/components/site/site-ticker"
import { APP_URL, SITE_URL, isSiteHost } from "@/lib/domains"

export const metadata: Metadata = {
  title: "mcro.fun - Swap Cronos memecoins the easy way",
  description:
    "Best-route memecoin swaps on Cronos, straight from your wallet. Plus a trading view, predictions for fun, NFT battles and 30% referral rewards. Non-custodial.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "mcro.fun - Swap Cronos memecoins the easy way",
    description: "Best-route memecoin swaps on Cronos, straight from your wallet.",
    url: SITE_URL,
    siteName: "mcro.fun",
    images: [{ url: "/images/mcro-logo.png", width: 512, height: 512, alt: "mcro.fun smiley coin logo" }],
    type: "website",
  },
}

export default async function SitePage() {
  const host = (await headers()).get("host")
  // Outside production the dApp lives at "/" on the same host.
  const appHref = isSiteHost(host) ? APP_URL : "/"

  return (
    <div className="arcade-lights min-h-screen overflow-x-hidden text-slate-100">
      <SiteHeader appHref={appHref} />
      <main>
        <SiteHero appHref={appHref} />
        <SiteTicker />
        <SiteFeatures />
        <SiteSteps appHref={appHref} />
        <SiteFaq />
      </main>
      <SiteFooter appHref={appHref} />
    </div>
  )
}
