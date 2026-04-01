import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = 45173
const PREVIEW_PORT = 46173

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: DEV_PORT,
  },
  preview: {
    port: PREVIEW_PORT,
  },
})
