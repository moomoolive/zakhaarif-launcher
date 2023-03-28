import {defineConfig, PluginOption} from "vite"
import path from "path"
import {fileURLToPath} from "url"
import {libraryDirs, ENTRY_FILE_NAME} from "./config.mjs"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

export const allowCrossOriginShare = () => ({
	name: "allow-shared-array-buffers",
	configureServer: (server) => {
		server.middlewares.use(function allowSharedArrayBuffers(_, res, next) {
			res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
			res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
			res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
			res.setHeader("Access-Control-Allow-Origin", "*")
			next()
		})
	}
} as const) as PluginOption

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [allowCrossOriginShare()],
	root: path.join(__dirname, "src"),
	publicDir: path.join(__dirname, "public"),
	build: {
		lib: {
			entry: libraryDirs.map(
				(dir) => path.join(__dirname, "src", dir, ENTRY_FILE_NAME)
			),
			formats: ["es"],
		},
		target: "es2020"
	},
	server: {port: 7_888},
	logLevel: "info",
	mode: "development"
})