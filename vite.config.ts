import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'mero-icon.svg',
        'favicon.ico',
        'favicon.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
      ],

      manifest: {
        name: 'DILG X - PDMU Project Monitoring System',
        short_name: 'PMS10',
        description: 'DILG X - PDMU Project Monitoring System',
        theme_color: '#0047D9',
        background_color: '#0047D9',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'en-PH',

        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
      },
    }),
  ],

  server: {
    host: '0.0.0.0',
    port: 5173,
  },

  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})