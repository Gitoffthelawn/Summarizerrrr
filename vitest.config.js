import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
    conditions: ['browser', 'development'],
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/vitest.js'],
    include: ['tests/**/*.test.js', 'tests/**/*.test.svelte.js'],
  },
})
