import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Parallel Life — One life. Infinite possibilities.",
  description: "Explore two sides of a decision in a cinematic interactive story. Play, compare, and discover what matters to you.",
  icons: { icon: "/favicon.ico" },
  alternates: { languages: { en: "/en", kk: "/kk", ru: "/ru", "x-default": "/" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
