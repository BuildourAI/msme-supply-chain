import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google'
import { ThemeProvider } from '@/state/theme-provider'
import { AppShell } from '@/components/shell/AppShell'
import './globals.css'

// §10 — Plex Sans Condensed for headings and figures, Plex Sans for body,
// Plex Mono for codes, dates and labels.
const sans = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-plex-sans',
})
const cond = IBM_Plex_Sans_Condensed({
  subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-plex-cond',
})
const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: 'Material Flow — MSME Supply Chain',
  description:
    'Sourcing, inbound, inventory, production material flow and dispatch for Indian MSME manufacturers.',
}

/** Sets the stored theme before first paint so the page never flashes the wrong one. */
const noFlash = `(function(){try{var t=localStorage.getItem('theme');
if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning
          className={`${sans.variable} ${cond.variable} ${mono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: noFlash }} /></head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
