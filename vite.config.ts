import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // In production builds, mark debug console calls as side-effect-free so the
  // minifier removes them. This drops 173+ console.log calls (some of which
  // logged user profile, sale rows, and PII) from the shipped bundle.
  // We deliberately KEEP console.error and console.warn — those are how we
  // notice real failures in production telemetry.
  esbuild: mode === 'production'
    ? { pure: ['console.log', 'console.debug', 'console.info', 'console.trace'] }
    : {},
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react'
            if (id.includes('@supabase')) return 'vendor-supabase'
          }
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  plugins: [
    react(),
    VitePWA({
      // prompt: show "New version" banner and reload when user clicks (avoids losing form data)
      registerType: 'prompt',
      includeAssets: ['icon.png'],
      manifest: {
        name: 'الادارة',
        short_name: 'الادارة',
        description: 'نظام إدارة الأراضي والعقارات',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/#login',
        // Tagging a non-maskable bitmap as `maskable` causes Pixel/Samsung
        // adaptive launchers to crop the logo edges. Declared as `any` only
        // until a real maskable icon (with safe-zone padding) is provided.
        icons: [
          {
            src: '/icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // SPA: serve index.html for all navigation so PWA opens correctly from home screen
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/_/, /^\/[^/]+\.[a-z0-9]+$/i],
        runtimeCaching: [
          {
            // Cache REST/storage GETs, never the auth or edge-function endpoints —
            // those need a live network round-trip. Caching POSTs to /functions/v1
            // breaks supabase-js with "Failed to send a request to the Edge Function".
            urlPattern: ({ url, request }) => {
              if (!/\.supabase\.co$/i.test(url.hostname)) return false
              if (url.pathname.startsWith('/functions/')) return false
              if (url.pathname.startsWith('/auth/')) return false
              return request.method === 'GET'
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false // Disable in dev mode
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: 'localhost',
    port: 3002,
    strictPort: true,
  },
}))
