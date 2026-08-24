import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Serif_Display } from 'next/font/google'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-dm-serif' })

const TITLE = 'ChairOS: The OS for Barbershop, Salon & Tattoo Owners'
const DESCRIPTION = 'Manage your shop, retain your team, and grow your revenue with ChairOS. Built for barbershops, salons, and tattoo studios.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ChairOS',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: '#4B5320',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-warm-50 antialiased" style={{ fontFamily: 'var(--font-dm-sans)' }}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}