export const locales = ["en", "kk", "ru"] as const;
export type Locale = typeof locales[number];
export const languageNames = { en: "English", kk: "Қазақша", ru: "Русский" };
export const languageCodes = { en: "EN", kk: "KZ", ru: "RU" };
export const localeKey = "parallel-life-locale";
export const isLocale = (value: unknown): value is Locale => locales.some((locale) => locale === value);
export function urlLocale(): Locale | undefined {
  const [, value] = window.location.pathname.split("/");
  return isLocale(value) ? value : undefined;
}
