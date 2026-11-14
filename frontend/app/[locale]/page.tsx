import { notFound } from "next/navigation";
import { ParallelLife } from "@/components/parallel-life";
import { isLocale, locales } from "@/i18n/config";
import { messages } from "@/i18n/messages";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return {
    title: `Parallel Life — ${t("One life.")} ${t("Infinite possibilities.")}`,
    description: t("Explore two sides of a decision in a cinematic interactive story. Play, compare, and discover what matters to you."),
    icons: { icon: "/favicon.ico" },
    alternates: { languages: { en: "/en", kk: "/kk", ru: "/ru", "x-default": "/" } },
  };
}

export default async function LocalePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ParallelLife initialLocale={locale} />;
}
