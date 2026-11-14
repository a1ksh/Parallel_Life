import ui from "../messages/ui.json";
import kk from "../../backend/app/scenarios/kk.json";
import ru from "../../backend/app/scenarios/ru.json";
import type { Locale } from "./config";

type UIKey = keyof typeof ui;
const stories: Record<"kk" | "ru", Record<string, string>> = { kk, ru };
const interfaceMessages: Record<string, { kk: string; ru: string }> = ui;

export function authored(locale: Locale, value: string): string {
  if (locale === "en") return value;
  return stories[locale][value] ?? interfaceMessages[value]?.[locale] ?? value;
}

export function messages(locale: Locale) {
  return (key: UIKey, values?: Record<string, string | number>) =>
    (locale === "en" ? key : ui[key][locale]).replace(/\{(\w+)\}/g, (full, field: string) =>
      values && field in values ? typeof values[field] === "number"
        ? new Intl.NumberFormat(locale, { useGrouping: false }).format(values[field])
        : String(values[field]) : full);
}
