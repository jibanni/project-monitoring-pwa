import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
      "favicon.ico",
      "favicon.png",
      "apple-touch-icon.png",
      "pwa-192x192.png",
      "pwa-512x512.png",
      "pwa-maskable-512x512.png",
    ],

      manifest: {
      name: "PMS10 – DILG Region X Project Monitoring System",
      short_name: "PMS10",
      description:
        "DILG Region X Project Monitoring System for project updates, GIS mapping, monitoring, reporting, and offline synchronization.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait-primary",
      theme_color: "#075DDB",
      background_color: "#075DDB",
      icons: [
        {
          src: "/pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/pwa-maskable-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
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