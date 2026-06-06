import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enTranslation from './locales/en/translation.json'
import ruTranslation from './locales/ru/translation.json'
import esTranslation from './locales/es/translation.json'
import deTranslation from './locales/de/translation.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      ru: { translation: ruTranslation },
      es: { translation: esTranslation },
      de: { translation: deTranslation },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru', 'es', 'de'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    pluralSeparator: '_',
  })

export default i18n
