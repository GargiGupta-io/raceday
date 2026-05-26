import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Racing_Sans_One } from "next/font/google";
import "./globals.css";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import PageLoader from "@/app/components/PageLoader";
import ScrollToTop from "@/app/components/ScrollToTop";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const racingFont = Racing_Sans_One({
  weight: "400",
  variable: "--font-racing",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://raceday-khaki.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RaceDay | F1 Race Stories And Strategy",
    template: "%s | Raceday",
  },
  description:
    "F1 race stories, strategy insights, live companion tools, and what-if simulations without the clutter.",
  openGraph: {
    title: "RaceDay | F1 Race Stories And Strategy",
    description:
      "Feel the chaos. Understand the strategy. Explore race stories, strategy calls, championship context, and live demo mode.",
    url: siteUrl,
    type: "website",
    siteName: "Raceday",
    images: [
      {
        url: "/images/race-flyby-still.webp",
        width: 1200,
        height: 630,
        alt: "RaceDay Formula 1 race story interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RaceDay | F1 Race Stories And Strategy",
    description:
      "F1 race stories, strategy insights, live companion tools, and what-if simulations without the clutter.",
    images: ["/images/race-flyby-still.webp"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${racingFont.variable} antialiased`}
        suppressHydrationWarning
      >
        <ScrollToTop />
        <PageLoader />
        <Suspense fallback={<div className="h-12 border-b border-white/[0.06]" />}>
          <Navbar />
        </Suspense>
        {children}
        <Footer />
      </body>
    </html>
  );
}
