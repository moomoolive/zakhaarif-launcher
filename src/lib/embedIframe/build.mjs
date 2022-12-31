import CleanCSS from "clean-css"
import path from 'path'
import { fileURLToPath } from 'url'
import fs from "fs/promises"

const APP_TITLE = "Embedder"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CSS_FILE_PATH = path.join(__dirname, "static/index.css")
const cssFile = await fs.readFile(CSS_FILE_PATH, {
    encoding: "utf-8"
})
const minifiedCss = new CleanCSS({}).minify(cssFile)

const JS_FILE_PATH = path.join(__dirname, "index.compiled.js")
const jsFile = await fs.readFile(JS_FILE_PATH, {
    encoding: "utf-8"
})

const htmlFile = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${APP_TITLE}</title>
    <style>${minifiedCss.styles}</style>
</head>
<body>
    <div id="root"></div>
    <script type="module">${jsFile}</script>
</body>
</html>`.trim()

const bytes = new TextEncoder().encode(htmlFile).length

console.info(`compiled html is ${(bytes / 1_000)}kb, `)