import path from 'path'
import { fileURLToPath } from 'url'
import {createServer} from "vite"
import {libraryDirs, ENTRY_FILE_NAME} from "./config.mjs"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vitejs.dev/config/
const server = await createServer({
    configFile: false,
    root: __dirname,
    publicDir: path.join(__dirname, "../public"),
    build: {
        lib: {
            entry: libraryDirs.map(
                (dir) => path.join(__dirname, dir, ENTRY_FILE_NAME)
            ),
            formats: ["es"],
        },
        target: "es2020"
    },
    server: {port: 6_555},
    logLevel: "info"
})

await server.listen()
server.printUrls()