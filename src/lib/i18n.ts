import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "@/locales";

/** The app's languages, each named in itself. Each has a folder in locales/ */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "tr", name: "Türkçe" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "ru", name: "Русский" },
  { code: "uk", name: "Українська" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "id", name: "Bahasa Indonesia" },
] as const;

export { resources };

/** The choice saved in this browser: "system" (the browser's language) or a code */
const STORAGE_KEY = "stoolap-language";

export function languagePreference(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "system";
  } catch {
    return "system";
  }
}

/** The browser's language, as one of the app's (English when none fits) */
export function systemLanguage(): string {
  const codes: string[] = LANGUAGES.map((l) => l.code);
  for (const tag of navigator.languages ?? [navigator.language]) {
    const exact = codes.find((c) => c.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    // zh-Hant, zh-HK and zh-MO read Traditional Chinese; other zh Simplified
    if (/^zh/i.test(tag)) return /^zh-(Hant|HK|MO|TW)/i.test(tag) ? "zh-TW" : "zh-CN";
    if (/^pt/i.test(tag)) return "pt-BR";
    const base = codes.find((c) => c === tag.split("-")[0].toLowerCase());
    if (base) return base;
  }
  return "en";
}

const resolve = (preference: string) =>
  preference !== "system" && LANGUAGES.some((l) => l.code === preference) ? preference : systemLanguage();

/** Start in the saved language, or the browser's. */
export async function initI18n(): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources,
    lng: resolve(languagePreference()),
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = i18n.language;
}

/** Switch to a language ("system" for the browser's) and keep the choice */
export async function setLanguage(preference: string): Promise<void> {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* not saved, but still shown */
  }
  const language = resolve(preference);
  document.documentElement.lang = language;
  await i18n.changeLanguage(language);
}

/** The app's language, for formatting numbers and dates */
export const locale = () => i18n.language || "en";

export default i18n;
