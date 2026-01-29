// PWA: register service worker and notify app when update is available
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // New content available; tell the app to show "New version - Refresh" banner
    window.dispatchEvent(new CustomEvent('pwa-update-available'))
  },
  onOfflineReady() {
    console.log('PWA: offline ready')
  },
  onRegistered(registration) {
    if (registration) console.log('PWA: SW registered', registration.scope)
  },
  onRegisterError(error) {
    console.warn('PWA: SW register error', error)
  },
})

// Expose reload for update banner (optional)
if (typeof window !== 'undefined') {
  ;(window as any).__pwa_updateSW = updateSW
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
