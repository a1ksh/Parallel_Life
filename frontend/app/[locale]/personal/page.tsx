import { notFound } from "next/navigation";
import { isLocale, locales } from "@/i18n/config";
import { PersonalStory } from "@/components/personal-story";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PersonalStory locale={locale} />;
}
