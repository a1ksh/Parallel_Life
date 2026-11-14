"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./config";
import { authored, messages } from "./messages";

export const LanguageContext = createContext<Locale>("en");
export function useTranslation() {
  const locale = useContext(LanguageContext);
  return { locale, t: messages(locale), story: (value: string) => authored(locale, value) };
}
