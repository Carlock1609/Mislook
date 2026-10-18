import type { Metadata, Viewport } from "next"
import { Archivo_Black, Inter } from "next/font/google"
import "./globals.css"

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
})

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Mislook — a daily image guessing game",
  description: "One image a day. See it before everyone else does.",
}

export const viewport: Viewport = {
  themeColor: "#080808",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
}

/** Root HTML shell: fonts as CSS variables, global styles. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivoBlack.variable} ${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
