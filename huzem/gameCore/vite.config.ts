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
    // only used during development
    // public folder at root of repo will not be copied
    // into repo
    publicDir: path.join(__dirname, "../../public"),
    build: {
        lib: {
            entry: path.join(fullDirpath, "index.ts"),
            formats: ["es"],
            fileName: "index"
        },
        manifest: "build-manifest.json",
        target: "es2020",
        outDir: `public/huzem/${dirPath}`,
        sourcemap: true,
    }
})