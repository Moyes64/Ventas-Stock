import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// This vite.config.ts is used when running renderer in standalone mode
// For Electron, electron.vite.config.ts takes precedence
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  root: 'src',
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
  },
})
