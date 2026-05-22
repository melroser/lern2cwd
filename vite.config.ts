import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = 45173
const PREVIEW_PORT = 46173
const DEFAULT_NETLIFY_SITE_URL = 'https://lern2cwd.netlify.app'

function normalizeSiteUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/$/, '')
  if (!trimmed) return DEFAULT_NETLIFY_SITE_URL
  return trimmed.replace(/\/\.netlify\/identity$/, '')
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const netlifySiteUrl = normalizeSiteUrl(env.VITE_NETLIFY_SITE_URL || env.NETLIFY_SITE_URL)

  return {
    plugins: [react()],
    server: {
      port: DEV_PORT,
      proxy: {
        '/.netlify/identity': {
          target: netlifySiteUrl,
          changeOrigin: true,
          secure: true,
        },
        '/.netlify/functions': {
          target: netlifySiteUrl,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    preview: {
      port: PREVIEW_PORT,
    },
  }
})
