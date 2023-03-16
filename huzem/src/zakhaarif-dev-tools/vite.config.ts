import {defineConfig, PluginOption} from "vite"
import dts from "vite-plugin-dts"
import {fileURLToPath} from "url"
import path from "path"
import {DEV_TOOL_ENTRIES} from "../../config.mjs"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const tsConfigFilePath = path.join(__dirname, "../../tsconfig.json")

export default defineConfig({
	publicDir: false,
	root: __dirname,
	build: {
		outDir: path.join(__dirname, "build"),
		target: "es2020",
		minify: false,
		lib: {
			entry: DEV_TOOL_ENTRIES.map(
				(relativePath) => path.join(__dirname, "src", relativePath)
			),
			formats: ["es"],
			fileName(_format, entryName) {
				return `${entryName}.js`
			},
		},
	},
	plugins: [dts({tsConfigFilePath}) as PluginOption],
})