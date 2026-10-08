import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

i18n
  .use(initReactI18next)
  .use(Backend)
  .use(LanguageDetector)
  .init({
    fallbackLng: "en",
    defaultNS: "translation",
    load: "languageOnly",
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath(lng: string, ns: string) {
        return (
          (window as Window & typeof globalThis & { DCS_STATIC_PREFIX: string })
            .DCS_STATIC_PREFIX + `locales/${lng}/${ns}.json`
        );
      },
    },
  });
