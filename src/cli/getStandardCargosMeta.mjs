import {dirname, join} from 'path'
import {fileURLToPath} from 'url'
import fs from "fs/promises"

const __dirname = dirname(fileURLToPath(import.meta.url))

const standardCargos = [
    {name: "addons", path: "../appShell/Addons.tsx"},
    {name: "game", path: "../game/main.ts"},
]

const metaStrings = await Promise.all(standardCargos.map(async (info) => {
    const {name, path} = info
    const filepath = join(__dirname, path)
    const {size} = await fs.stat(filepath)
    return `export const ${name.toUpperCase()}_ESTIMATED_BYTES = ${size}`
}))

const outPath = join(__dirname, "../cargosMeta.ts")

const metaFile = `
// AUTO-GENERATED DO NOT EDIT
${metaStrings.join("\n")}
`.trim()

await fs.writeFile(outPath, metaFile)

console.info(`wrote cargo meta estimate to "${outPath}"`)