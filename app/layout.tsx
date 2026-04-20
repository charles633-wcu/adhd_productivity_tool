import type { Metadata } from "next"
import { Syne, Outfit, Geist_Mono } from "next/font/google"
import "./globals.css"

// Syne — geometric, architectural display font for headings
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
})

// Outfit — clean geometric sans for body copy
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
})

// Geist Mono — for labels, badges, metadata
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Sentinel",
  description: "Your personal intelligence layer",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Force dark mode as default — theme is dark-only for now
      className={`${syne.variable} ${outfit.variable} ${geistMono.variable} dark h-full`}
    >
      {/* Apply saved appearance colors before first paint to avoid flash */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var p = localStorage.getItem('sentinel-primary-color');
            var b = localStorage.getItem('sentinel-bg-color');
            var r = document.documentElement;
            if (p) { r.style.setProperty('--primary', p); r.style.setProperty('--ring', p); r.style.setProperty('--sidebar-primary', p); r.style.setProperty('--sidebar-ring', p); r.style.setProperty('--chart-1', p); }
            if (b) { r.style.setProperty('--background', b); }
          } catch(e) {}
        ` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
