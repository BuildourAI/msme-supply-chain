import type { Metadata } from 'next'
import { IBM_Plex_Mono, Inter } from 'next/font/google'
import { ThemeProvider } from '@/state/theme-provider'
import { AppShell } from '@/components/shell/AppShell'
import './globals.css'

// Inter for body, headings and figures — the closest open face to SF Pro, which
// is what the Apple-style surfaces are drawn for and cannot be shipped on the
// web. It is a variable font, so one file covers every weight used here. Plex
// Mono stays for codes, dates and labels: tabular, narrow, and unlike Inter it
// keeps a mono's rhythm at 10px. Every stylesheet reference still reads
// --font-plex-sans / --font-plex-cond; globals.css aliases both onto Inter.
const sans = Inter({
  subsets: ['latin'], display: 'swap', variable: '--font-inter', axes: ['opsz'],
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
          className={`${sans.variable} ${mono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: noFlash }} /></head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
