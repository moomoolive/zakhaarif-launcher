import { defineConfig, PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// taken from https://github.com/chaosprint/vite-plugin-cross-origin-isolation
const allowSharedArrayBuffer = () => ({
  name: "allow-shared-array-buffers",
  configureServer: (server) => {
    server.middlewares.use((_, res, next) => {
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
      //res.setHeader("X-Frame-Options", "deny")
      next()
    })
  }
} as const) as PluginOption

const logServerRequests = ({silent = false, withHeaders = true} = {}) => ({
  name: "log server-requests",
  configureServer: (server) => {
    server.middlewares.use((req, _, next) => {
      if (!silent) {
        console.info(`[${req.method}] ${req.originalUrl}`)
      }
      if (!silent && withHeaders) {
        const message = Object.keys(req.headers).reduce((total, next) => {
          const val = req.headers[next]
          return total + `${next}: ${Array.isArray(val) ? val.join(",") : val}\n`
        }, "")
        console.info(message)
      }
      next()
    })
  }
} as const) as PluginOption

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    allowSharedArrayBuffer(),
    logServerRequests({silent: true, withHeaders: false})
  ],
  build: {
    manifest: "build-manifest.json",
    target: "es2020"
  },
  resolve: {
    alias: {
      "@": path.join(path.resolve(__dirname), "src"),
    }
  }
})
