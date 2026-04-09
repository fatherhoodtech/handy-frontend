import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '.'), '')
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080').replace(
    /\/$/,
    ''
  )

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/auth': { target: apiProxyTarget, changeOrigin: true },
        '/api': { target: apiProxyTarget, changeOrigin: true },
      },
    },
  }
})
