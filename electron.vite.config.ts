import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: { index: resolve('electron/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: { index: resolve('electron/preload/index.ts') } } }
  },
  renderer: {
    root: resolve('src'),
    plugins: [react()],
    resolve: { alias: { '@shared': shared, '@': resolve('src') } },
    build: { rollupOptions: { input: { index: resolve('src/index.html') } } }
  }
})
