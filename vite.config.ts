/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE ?? process.env.BASE ?? '/winter-arc/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Winter Arc',
        short_name: 'Winter Arc',
        description: 'Зимняя арка: 98 дней режима, тела и дела.',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#060a13',
        theme_color: '#060a13',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
