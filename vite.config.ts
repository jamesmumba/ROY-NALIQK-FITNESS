import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), tailwindcss()],
    // Optional dev proxy for environments where the browser cannot reach Supabase directly.
    server: env.VITE_SUPABASE_DEV_PROXY
      ? { proxy: { '/sb': { target: env.VITE_SUPABASE_URL, changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/sb/, '') } } }
      : undefined,
  }
})
