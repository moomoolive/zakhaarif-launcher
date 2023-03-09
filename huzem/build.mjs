import path from 'path'
import { fileURLToPath } from 'url'
import {build} from "vite"
import {createHuzma} from "huzma/dist/cli.js"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** @type {string[]} */
const packagesToBuild = ["standardMod", "gameCore"]

for (const dirPath of packagesToBuild) {
    const fullDirpath = path.join(__dirname, dirPath)
    const configFile = path.join(fullDirpath, "vite.config.ts")
    await build({configFile, publicDir: false})
    const configFileName = path.join(fullDirpath, "huzma.config.mjs") 
    await createHuzma({configFileName})
}