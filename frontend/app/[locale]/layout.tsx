import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import "../globals.css";

export default async function LocaleLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <html lang={locale} suppressHydrationWarning><body>{children}</body></html>;
}
