import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
// import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['logo.png', 'galochcka.png', 'no_bg.png', 'offline.html'],
      devOptions: {
        enabled: false,
        type: 'module',
      },
      manifest: {
        name: 'Нексо Мессенджер',
        short_name: 'Нексо',
        description: 'Мессенджер',
        theme_color: '#5123f5ff',
        background_color: '#000000ff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'ru',
        dir: 'ltr',
        categories: ['social', 'communication'],
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Новый чат',
            short_name: 'Чат',
            description: 'Начать новый чат',
            url: '/?action=new-chat',
            icons: [{ src: '/logo.png', sizes: '192x192' }]
          },
          {
            name: 'Поиск',
            short_name: 'Поиск',
            description: 'Поиск сообщений и контактов',
            url: '/?action=search',
            icons: [{ src: '/logo.png', sizes: '192x192' }]
          }
        ],
        screenshots: [
          {
            src: '/logo.png',
            sizes: '540x720',
            type: 'image/png',
            form_factor: 'narrow'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/uploads\/.+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav|ogg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/api\/files\/.+\/download$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'file-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/api\/(search|users|chats)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 5,
            }
          },
          {
            urlPattern: /\/api\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-fallback',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 4
              },
              cacheableResponse: {
                statuses: [0, 200]
              },
              networkTimeoutSeconds: 10,
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/framer-motion')) {
            return 'animation-vendor';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'date-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) {
            return 'socket-vendor';
          }
          if (id.includes('node_modules/@emoji-mart') || id.includes('node_modules/emoji-mart')) {
            return 'emoji-vendor';
          }
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'framer-motion',
      'date-fns',
      'lucide-react',
      'zustand',
    ],
  },
    server: {
     host: '0.0.0.0',
     port: Number(process.env.PORT) || 6023,
     hmr: {
       protocol: 'ws',
       host: 'localhost',
       port: Number(process.env.PORT) || 6023,
     },
     https: false,
      proxy: {
        '/frontend-api-app': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true,
        },
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
   },
});
