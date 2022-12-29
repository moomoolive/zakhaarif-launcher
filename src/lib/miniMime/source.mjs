import path from 'path'
import { fileURLToPath } from 'url'
import fs from "fs/promises"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sourceJson = await fs.readFile(
    path.join(__dirname, "source.json"),
    {encoding: "utf-8"}
)

/** @type {Array<{ext: string[], mime: string}>} */
const rawSources = JSON.parse(sourceJson)

/** @type {Record<string, {ext: string[], mime: string}>} */ 
const initMap = {}
const sourcesMap = rawSources.reduce((total, source) => {
    const first = source.ext[0]
    total[first] = {...source}
    return total
}, initMap)

const orderedSources = rawSources
    .map(s => s.ext[0])
    .sort()

const sources = orderedSources.map((name) => sourcesMap[name])

/** @type {string[]} */
const strs = []
for (const {ext, mime} of sources) {
    const cases = ext.reduce((t, e) => {
        return t + `\t\tcase "${e.replace(".", "")}":\n`
    }, "")
    const val = `\t\t\treturn "${mime}"`
    strs.push(cases + val)
}

const OUTPUT_FILE = "generatedSources.ts"

const SWITCH_OUTPUT = "switch.ts"

const switchFunction = `
// taken from https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
export const extensionToMime = (extension: string) => {
    switch (extension) {\n${strs
            .reduce((t, s) => t + s + "\n", "")
        }\t\tdefault:
            return ""
    }
}
`.trim()

console.info("Generated mime switch statement")


const allExtensions = rawSources
    .map((source) => source.ext)
    .flat()
    .map((extension) => extension.slice(1))
    .sort()

const extensionUnion = `
export type FileExtension = (
${allExtensions.reduce((total, extension) => {
    return total + `\t"${extension}" |\n`
}, "").slice(0, -2)}
)
`.trim()

console.info("Generated file extension union type")

/** @type {Record<string, boolean>} */
const mimeMap = {}

const allMimes = rawSources
    .map((source) => source.mime)
    // remove duplicates
    .filter((mime) => {
        if (mimeMap[mime]) {
            return false
        }
        mimeMap[mime] = true
        return true
    })
    .sort()

const mimeUnion = `
export type Mime = (
${allMimes.reduce((total, extension) => {
    return total + `\t"${extension}" |\n`
}, "").slice(0, -2)}
)
`.trim()

console.info("Generated all writing to", OUTPUT_FILE)

const output = `
// AUTO-GENERATED DO NOT EDIT

${switchFunction}

${extensionUnion}

${mimeUnion}

// END
`.trim()

await fs.writeFile(
    path.join(__dirname, OUTPUT_FILE),
    output,
    {encoding: "utf-8"}
)
