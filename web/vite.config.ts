import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre 6 lance son worker comme module ES (new Worker(url, { type: "module" }))
  worker: { format: 'es' },
})
