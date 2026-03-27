import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { BackgroundOrbs } from "@/components/background-orbs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Albüm ilk sayfa şiiri vb. */
const poemSerif = Cormorant_Garamond({
  variable: "--font-poem",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["italic", "normal"],
});

export const metadata: Metadata = {
  title: "Lila Köprü",
  description: "Modern Lila & Glassmorphism",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${poemSerif.variable} h-full antialiased`}
    >
      <body className="relative min-h-screen min-h-[100dvh] bg-[#0F172A] font-sans text-slate-100">
        <BackgroundOrbs />
        <div className="relative z-10 flex min-h-screen min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10 md:px-8 md:py-12 lg:px-12 lg:py-14">
          {children}
        </div>
      </body>
    </html>
  );
}
