// CRITICAL: Unregister service workers IMMEDIATELY before anything else runs
// This prevents old cached code from running
(function() {
  if ('serviceWorker' in navigator) {
    // Check if we're on production (not localhost)
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    
    if (isProduction) {
      // Unregister all service workers immediately
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          console.log('Found', registrations.length, 'service worker(s) - unregistering...')
          Promise.all(registrations.map(r => r.unregister())).then(() => {
            console.log('All service workers unregistered')
            // Clear all caches
            if ('caches' in window) {
              caches.keys().then((cacheNames) => {
                Promise.all(cacheNames.map(name => caches.delete(name))).then(() => {
                  console.log('All caches cleared - reloading...')
                  // Force reload to get fresh code
                  setTimeout(() => window.location.reload(), 100)
                })
              })
            } else {
              setTimeout(() => window.location.reload(), 100)
            }
          })
        }
      })
      
      // Also try to unregister by scope
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          registration.unregister().catch(() => {})
        }
      })
    }
  }
})()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <App />
  </StrictMode>,
)
