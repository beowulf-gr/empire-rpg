import { defineConfig } from 'vitest/config'

// Vitest config kept separate from vite.config.ts so the test block doesn't
// have to satisfy Vite's UserConfig type. Vitest auto-loads vite.config.ts
// for plugins/aliases first, then merges this file's `test` block on top.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
