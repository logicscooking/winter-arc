/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE ?? process.env.BASE ?? '/winter-arc/'

export default defineConfig({
  base,
  // dev only: the free AI tier asks pages served from localhost for a Turnstile token,
  // so the dev server forwards AI calls without the Origin (production calls Pollinations directly)
  server: {
    proxy: {
      [`${base}__ai`]: {
        target: 'https://text.pollinations.ai',
        changeOrigin: true,
        rewrite: (p) => p.slice(`${base}__ai`.length),
        configure: (proxy) => proxy.on('proxyReq', (req) => (req.removeHeader('origin'), req.removeHeader('referer'))),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Winter Arc',
        short_name: 'Winter Arc',
        description: 'Зимняя арка: 98 дней режима, тела и дела. С разминкой до старта.',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1d17',
        theme_color: '#0f1d17',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // signed .shortcut files must reach the network, not the SPA shell
        navigateFallbackDenylist: [/\/shortcuts\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
