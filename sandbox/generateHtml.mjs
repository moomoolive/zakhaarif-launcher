import * as esbuild from "esbuild"
import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import fs from "fs/promises"

const __dirname = dirname(fileURLToPath(import.meta.url))

const outfile = join(__dirname, "index.compiled.js")

await esbuild.build({
    entryPoints: [join(__dirname, "index.ts")],
    bundle: true,
    minify: true,
    outfile,
    format: "esm"
})

const htmlTemplatePath = join(__dirname, "template.html")
const jsReplaceTag = `<div id="replace-me"></div>`

const htmlOutPath = join(__dirname, "src/index.html")

const [jsText, htmlTemplate] = await Promise.all([
    fs.readFile(outfile, {encoding: "utf-8"}),
    fs.readFile(htmlTemplatePath, {encoding: "utf-8"}),
])

const newHtml = htmlTemplate.replace(
    jsReplaceTag,
    `<script type="module" defer>${jsText}</script>`
)

await fs.writeFile(htmlOutPath, newHtml, {encoding: "utf-8"})

const generatedStats = await fs.stat(htmlOutPath)

console.info(`generated html has a size of ${(generatedStats.size / 1_000).toFixed(2)}kb`)