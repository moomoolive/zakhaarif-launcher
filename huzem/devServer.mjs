import path from 'path'
import { fileURLToPath } from 'url'
import {createServer} from "vite"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const server = await createServer({
    configFile: path.join(__dirname, "devServer-vite.config.ts")
})

await server.listen()
server.printUrls()