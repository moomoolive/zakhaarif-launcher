import {defineConfig} from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import {libraryDirs, ENTRY_FILE_NAME} from "./config.mjs"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    root: __dirname,
    publicDir: path.join(__dirname, "public"),
    build: {
        lib: {
            entry: libraryDirs.map(
                (dir) => path.join(__dirname, dir, ENTRY_FILE_NAME)
            ),
            formats: ["es"],
        },
        target: "es2020"
    },
    server: {port: 7_888},
    logLevel: "info",
    mode: "development"
})