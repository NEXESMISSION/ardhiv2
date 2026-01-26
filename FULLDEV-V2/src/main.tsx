import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Unregister any existing service workers to prevent caching issues
// This ensures users get the latest code after deployment
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then((success) => {
        if (success) {
          console.log('Service Worker unregistered successfully')
        }
      }).catch((error) => {
        console.error('Error unregistering service worker:', error)
      })
    }
  })
  
  // Also clear all caches to ensure fresh code
  if ('caches' in window) {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Deleting cache:', cacheName)
          return caches.delete(cacheName)
        })
      )
    }).then(() => {
      console.log('All caches cleared - please refresh the page (Ctrl+Shift+R)')
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <App />
  </StrictMode>,
)
