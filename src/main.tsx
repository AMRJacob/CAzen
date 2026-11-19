import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import { drainWhenOnline } from './lib/offline/outbox'
import { keepCurrentWhenOnline } from './lib/offline/keepCurrent'
import App from './App'

// HashRouter so the app also works from GitHub Pages without server rewrites.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Anything written with no signal goes back the moment there is one.
drainWhenOnline()

// A project held on this device is kept the same as the job, without being asked.
keepCurrentWhenOnline()

// Put the app itself on the device, so it opens where there is no signal to fetch it with.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}) })
}
