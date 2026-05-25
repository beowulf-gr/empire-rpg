import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Test config lives in vitest.config.ts (kept separate so Vite's UserConfig
// type doesn't fight with Vitest's own bundled-vite type union).
//
// `base` prefixes all built asset URLs so the app can be served from
// https://rpg.tsipenios.gr/empire/ instead of the domain root. Must match
// the React Router `basename` in src/App.tsx and the nginx `location` path.
// For local dev (`npm run dev`) Vite still serves at /empire/ — open
// http://localhost:5173/empire/ in the browser.
export default defineConfig({
  base: '/empire/',
  plugins: [react(), tailwindcss()],
})
