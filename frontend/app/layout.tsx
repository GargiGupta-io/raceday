import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Racing_Sans_One } from "next/font/google";
import "./globals.css";
import Navbar from "@/app/components/Navbar";
import PageLoader from "@/app/components/PageLoader";

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

export const metadata: Metadata = {
  title: {
    default: "Raceday | F1 Race Intelligence",
    template: "%s | Raceday",
  },
  description:
    "Race stories, strategy breakdowns, championship standings, and historical pattern analysis for every F1 season from 2010 to 2025.",
  openGraph: {
    title: "Raceday | F1 Race Intelligence",
    description:
      "Race stories, strategy breakdowns, championship standings, and historical pattern analysis for Formula 1.",
    type: "website",
    siteName: "Raceday",
  },
  twitter: {
    card: "summary_large_image",
    title: "Raceday | F1 Race Intelligence",
    description:
      "Race stories, strategy breakdowns, championship standings, and historical pattern analysis for Formula 1.",
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
        <PageLoader />
        <Suspense fallback={<div className="h-12 border-b border-white/[0.06]" />}>
          <Navbar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
