import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const dirPath = "gameCore"
const fullDirpath = __dirname

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [],
    base: fullDirpath + "/",
    publicDir: false,
    build: {
        lib: {
            entry: path.join(fullDirpath, "index.ts"),
            formats: ["es"],
            fileName: "index.js"
        },
        manifest: "build-manifest.json",
        target: "es2020",
        outDir: `public/huzem/${dirPath}`,
        sourcemap: true,
    }
})