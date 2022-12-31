import express from "express"
import path from 'path'
import { fileURLToPath } from 'url'
import cors from "cors"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const port = 3000

app.use(cors({origin: true, credentials: true}))
app.use((_, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
    next()
})

const staticPath = path.join(__dirname, "static")
app.use(express.static(staticPath))
app.get('/ping', (_, res) => res.json('Hello World!\n'))

app.listen(port, () => console.info(`app is listen on port ${port}`))