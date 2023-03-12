import path from 'path'
import { fileURLToPath } from 'url'
import {build} from "vite"
import {createHuzma} from "huzma/dist/cli.js"
import {libraryDirs, ENTRY_FILE_NAME} from "./config.mjs"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

for (const dirPath of libraryDirs) {
    const fullDirpath = path.join(__dirname, "src", dirPath)
   
    // https://vitejs.dev/config/
    await build({
        configFile: false,
        publicDir: false,
        base: path.join(__dirname, "/src/"),
        build: {
            lib: {
                entry: path.join(fullDirpath, ENTRY_FILE_NAME),
                formats: ["es"],
                fileName: "index"
            },
            manifest: "build-manifest.json",
            sourcemap: true,
            target: "es2020",
            outDir: `dist/huzem/${dirPath}`
        },
        logLevel: "info"
    })

    await createHuzma({
        configFileName: path.join(fullDirpath, "huzma.config.mjs") 
    })
}