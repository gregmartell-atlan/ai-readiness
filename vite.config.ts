import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/mdlh': {
        target: process.env.GATEWAY_ORIGIN || 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
      '/api/state': {
        target: process.env.GATEWAY_ORIGIN || 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
      '/api/atlan': {
        target: process.env.GATEWAY_ORIGIN || 'http://127.0.0.1:4173',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
