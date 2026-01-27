// PWA Service Worker Registration
// The vite-plugin-pwa handles service worker registration automatically
// This code ensures proper PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Service worker is registered automatically by vite-plugin-pwa
    // This is just for logging and ensuring PWA is ready
    navigator.serviceWorker.ready.then((registration) => {
      console.log('PWA Service Worker ready:', registration.scope)
    }).catch((error) => {
      console.log('PWA Service Worker registration failed:', error)
    })
  })
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <App />
  </StrictMode>,
)
