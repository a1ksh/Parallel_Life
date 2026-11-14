import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parallel Life — Басқа жолды таңдасаң ше?",
  description: "Қазақша үш интерактивті оқиға. Екі шешім қабылдап, балама финалдарды салыстыр.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="kk"><body>{children}</body></html>;
}
