import { defineConfig, PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

// taken from https://github.com/chaosprint/vite-plugin-cross-origin-isolation
const allowSharedArrayBuffer = () => ({
  name: "allow-shared-array-buffers",
  configureServer: (server) => {
    server.middlewares.use((_, res, next) => {
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
      next()
    })
  }
} as const) as PluginOption

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    allowSharedArrayBuffer()
  ],
  build: {
    manifest: "build-manifest.json",
    target: "es2020"
  }
})
