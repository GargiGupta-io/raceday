import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Race Companion",
  description: "Real-time F1 strategy predictions, tyre life tracking, and pit window analysis during live race sessions.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
