import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: { build: { lib: { entry: 'electron/main.ts' } } },
  preload: { build: { lib: { entry: 'electron/preload.ts' } } },
  renderer: {
    root: '.',
    build: { rollupOptions: { input: 'index.html' } },
    resolve: { alias: { '@': resolve('src') } },
    plugins: [react(), tailwindcss()],
  },
})
