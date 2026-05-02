import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '.'), '')
  const apiProxyTarget = (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080').replace(
    /\/$/,
    ''
  )

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
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
