// Service Worker for PWA
// Bump cache versions to ensure clients always get the latest frontend bundle
// When you deploy a new version, increment these strings to bust old cached assets
const CACHE_NAME = 'land-management-v2'
const STATIC_CACHE_NAME = 'land-management-static-v2'

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/image.png',
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.log('Cache addAll failed:', err)
      })
    })
  )
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Skip Supabase API calls - always use network
  if (event.request.url.includes('supabase.co')) {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone()

        // Cache successful responses (except Supabase)
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }

        return response
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse
          }
          // If no cache, return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/')
          }
        })
      })
  )
})

