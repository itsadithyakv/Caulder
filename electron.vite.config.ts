import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const shared = resolve('shared')

/**
 * Which packages a build carries inside its bundle, for the licences
 * (PLAN.md, part six): out/notices/bundled-<target>.json, read by
 * scripts/notices.mjs. What is not bundled is a runtime dependency, which
 * that script finds in package.json.
 */
function bundledPackages(target: string): Plugin {
  return {
    name: 'caulder-bundled-packages',
    apply: 'build',
    generateBundle() {
      const found: Record<string, string> = {}
      for (const id of this.getModuleIds()) {
        const path = id.replace(/^\0/, '').split('?')[0]!.replace(/\\/g, '/')
        const at = path.lastIndexOf('/node_modules/')
        if (at < 0) continue
        const rest = path.slice(at + '/node_modules/'.length).split('/')
        const name = rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!
        found[name] = path.slice(0, at + '/node_modules/'.length) + name
      }
      const folder = resolve('out/notices')
      mkdirSync(folder, { recursive: true })
      writeFileSync(resolve(folder, `bundled-${target}.json`), JSON.stringify(found, null, 2))
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), bundledPackages('main')],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/main/index.ts'),
          // The model's own process (PLAN.md, part five): out/main/understand.js.
          understand: resolve('electron/main/understand/worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), bundledPackages('preload')],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve('electron/preload/index.ts') },
        // CommonJS, because Electron runs an ESM preload only with the
        // sandbox off, and both windows run sandboxed.
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: resolve('src'),
    plugins: [react(), bundledPackages('renderer')],
    resolve: { alias: { '@shared': shared, '@': resolve('src') } },
    build: { rollupOptions: { input: { index: resolve('src/index.html') } } }
  }
})
