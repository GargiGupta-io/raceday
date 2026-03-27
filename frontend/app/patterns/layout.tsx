import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pattern Finder",
  description: "Search across 16 F1 seasons for patterns — wet race upsets, pole conversion rates, one-stop vs two-stop strategies, and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
