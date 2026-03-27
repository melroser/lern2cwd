import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = 45173
const PREVIEW_PORT = 46173

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Frontend runtime currently supports browser-direct API calls.
  // Allow either Vite-prefixed or Netlify-friendly env names.
  const effectiveApiKey =
    env.VITE_OPENAI_API_KEY ||
    env.OPENAI_API_KEY ||
    env.NETLIFY_OPENAI_API_KEY ||
    ''

  const effectiveApiKeySource = env.VITE_OPENAI_API_KEY
    ? 'VITE_OPENAI_API_KEY'
    : env.OPENAI_API_KEY
      ? 'OPENAI_API_KEY'
      : env.NETLIFY_OPENAI_API_KEY
        ? 'NETLIFY_OPENAI_API_KEY'
        : ''

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(effectiveApiKey),
      'import.meta.env.VITE_OPENAI_API_KEY_SOURCE': JSON.stringify(effectiveApiKeySource),
    },
    server: {
      port: DEV_PORT,
    },
    preview: {
      port: PREVIEW_PORT,
    },
  }
})
