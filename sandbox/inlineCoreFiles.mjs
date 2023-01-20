import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import fs from "fs/promises"

const __dirname = dirname(fileURLToPath(import.meta.url))

const htmlSourcePath = "/src/index.html"
const indexFile = join(__dirname, htmlSourcePath)
const jsSourcePath = "/src/secure.compiled.js"
const secureJsScript = join(__dirname, jsSourcePath)

const [htmlString, jsString] = await Promise.all([
    fs.readFile(indexFile, {encoding: "utf-8"}),
    fs.readFile(secureJsScript, {encoding: "utf-8"}),
])

const inlineHtmlPath = "/serviceWorker/index-html.inlined.json"
const htmlPath = join(__dirname, inlineHtmlPath)
const inlineJsPath = "/serviceWorker/secure-compiled-mjs.inlined.json"
const jsPath = join(__dirname, inlineJsPath)
await Promise.all([
    fs.writeFile(htmlPath, JSON.stringify(htmlString), {encoding: "utf-8"}),
    fs.writeFile(jsPath, JSON.stringify(jsString), {encoding: "utf-8"}),
])

const byteLength = (str = "") => new TextEncoder().encode(str).length

const metadataPath = "/serviceWorker/inlinedMeta.ts"
const inlinedMetadataPath = join(__dirname, metadataPath)

const htmlSize = byteLength(htmlString)
const jsSize = byteLength(jsString)

const sizeText = `
export const INDEX_HTML_LENGTH = ${htmlSize}
export const SECURE_MJS_LENGTH = ${jsSize}
`.trim()

await fs.writeFile(inlinedMetadataPath, sizeText, {encoding: "utf-8"})

console.info(`[SANDBOX_COMPILATION] inlined '${htmlSourcePath}' to '${inlineHtmlPath}' (${(htmlSize / 1_000).toFixed(2)}kb)`)
console.info(`[SANDBOX_COMPILATION] inlined '${jsSourcePath}' to '${inlineJsPath}' (${(jsSize / 1_000).toFixed(2)}kb)`)