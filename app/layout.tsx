import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Manrope } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-manrope',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'mcro.fun - Swap Cronos memecoins',
  description: 'Swap Cronos memecoins at the best route, straight from your wallet. Live prices, a trading view and non-custodial swaps.',
  generator: 'v0.app',
  icons: {
    icon: '/images/mcro-logo.png',
    apple: '/images/mcro-logo.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0e0f12',
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${manrope.variable} ${inter.variable} bg-[#0e0f12]`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  )
}
