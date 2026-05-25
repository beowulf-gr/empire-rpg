import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Test config lives in vitest.config.ts (kept separate so Vite's UserConfig
// type doesn't fight with Vitest's own bundled-vite type union).
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
