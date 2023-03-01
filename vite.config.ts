import {defineConfig, PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import sirv from "sirv"

// taken from https://github.com/chaosprint/vite-plugin-cross-origin-isolation
const serverAllowSharedArrayBuffer = () => ({
  name: "allow-shared-array-buffers",
  configureServer: (server) => {
    server.middlewares.use(function allowSharedArrayBuffers(_, res, next) {
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
      res.setHeader("X-Frame-Options", "deny")
      next()
    })
  }
} as const) as PluginOption

const removeGzipContentType = () => ({
  name: "remove-gzip-encoding-headers",
  configureServer: (server) => {

    const serveStaticFile = sirv("public", {
      etag: true,
      dev: true,
      extensions: [],
      brotli: false,
      gzip: false
    })

    server.middlewares.use(function serveGzipFiles(req, res, next) {
      const extension = (req.url || "").split(".").at(-1) || ""
      if (extension !== "gz") {
        next()
        return 
      }
      
      res.setHeader("Content-Type", "application/x-gzip")
      // force dev server not to set content-encoding
      // to gzip as we'll be decompressing manually
      res.setHeader("Content-Encoding", "custom")
      serveStaticFile(req, res, next)
    })
  }
} as const) as PluginOption

const logServerRequests = ({silent = false, withHeaders = true} = {}) => ({
  name: "log server-requests",
  configureServer: (server) => {
    server.middlewares.use(function logServerRequests(req, _, next) {
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
    serverAllowSharedArrayBuffer(),
    logServerRequests({silent: true, withHeaders: false}),
    removeGzipContentType(),
  ],
  build: {
    manifest: "build-manifest.json",
    target: "es2020",
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          dexie: ["dexie"],
          "@mui/material": ["@mui/material"],
          "@fortawesome/free-brands-svg-icons": ["@fortawesome/free-brands-svg-icons"],
          "@fortawesome/free-solid-svg-icons": ["@fortawesome/free-solid-svg-icons"],
        } 
      }
    }
  },
})
