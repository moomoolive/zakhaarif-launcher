import express from "express"
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import cors from "cors"

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
const port = 6777

const corsOptions = {
    origin: [
        "http://localhost:5173", // dev-origin
        "http://localhost:4173" // preview-origin
    ]
}

const appCors = () => cors(corsOptions)

app.options("*", appCors())
app.use(appCors())
app.use((req, _, next) => {
    console.info(`[${req.method}] ${req.url}`)
    next()
})
app.use((_, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
    next()
})
app.use(express.static(join(__dirname, "src")))

app.get("/ping", (_, res) => res.json("hey there"))

app.listen(port, () => {
    console.info(`sandbox dev-server is listening on http://localhost:${port}`, "[ port=", port, "]")
})