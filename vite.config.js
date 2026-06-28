import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain static build → dist/ (index.html at the root). The API lives in
// functions/ as Cloudflare Pages Functions, deployed alongside these assets.
const devPort = Number(process.env.VITE_DEV_PORT) || 5173

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    // When dev.sh runs wrangler `--proxy` in front of Vite, the page is served
    // from the wrangler port but Vite's HMR websocket lives here on devPort —
    // point the browser's HMR client straight at it so hot-reload works.
    hmr: { clientPort: devPort },
  },
})
