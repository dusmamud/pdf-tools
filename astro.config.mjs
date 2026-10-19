// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

export const locales = [
  'en', 'hi', 'bn', 'as', 'es', 'pt', 'fr', 'ar', 'ur', 'zh',
  'ja', 'ko', 'ru', 'id', 'de', 'tr', 'it', 'vi', 'th', 'ta',
];

export const rtlLocales = ['ar', 'ur'];

// https://astro.build/config
export default defineConfig({
  site: 'https://dusmamud.github.io/pdf-tools',
  base: '/pdf-tools',
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: Object.fromEntries(locales.map((l) => [l, l])),
      },
    }),
    icon({ include: { ph: ['*'] } }),
  ],
  i18n: {
    defaultLocale: 'en',
    locales,
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
});
