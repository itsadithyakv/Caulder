import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('shared'), '@': resolve('src') } },
  test: {
    environment: 'node',
    include: ['{electron,shared,src}/**/*.test.ts'],
    reporters: 'dot'
  }
})
