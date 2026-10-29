import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' lets the built app run from GitHub Pages (username.github.io/cazen/)
// or any static host without changes.
export default defineConfig({
  plugins: [react()],
  base: './',
})
