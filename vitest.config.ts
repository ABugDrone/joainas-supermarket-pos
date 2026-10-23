/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The default forks pool times out on this Windows workspace; threads is
    // reliable. Timeouts are generous because jsdom + setup take several seconds.
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  esbuild: {
    jsx: 'automatic',
  },
})