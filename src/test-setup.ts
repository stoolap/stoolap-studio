import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "@/lib/i18n";

// Tests see the English text
await i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});
