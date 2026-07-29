import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    // En dev, la web corre en su propio puerto (Vite) y el backend (Hono +
    // WS) en DASHBOARD_PORT — todo lo que empiece con /api o /ws se manda
    // para allá en vez de intentar resolverlo como un asset de Vite.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4002', changeOrigin: true },
      '/ws':  { target: 'ws://127.0.0.1:4002', ws: true },
    },
  },
  build: {
    // El backend (src/dashboard/server.ts) sirve esta carpeta como estático
    // en producción — mismo origen para API/WS/UI, sin CORS.
    outDir: 'dist',
  },
})
