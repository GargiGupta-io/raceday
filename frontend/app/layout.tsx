import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Racing_Sans_One } from "next/font/google";
import "./globals.css";
import Navbar from "@/app/components/Navbar";

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
  title: "Raceday",
  description: "F1 fan intelligence platform — race results, strategy, and championship standings",
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
        <Suspense fallback={<div className="h-12 border-b border-zinc-800 bg-zinc-950" />}>
          <Navbar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
