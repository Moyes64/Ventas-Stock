import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Se sirve desde la raíz del servidor LAN de electron/modules/web-catalog-server
// (path relativo: en dev puede probarse aparte con `vite dev` en cualquier puerto).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5180,
  },
})
