import path from 'path'
import { fileURLToPath } from 'url'
import {build} from "vite"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** @type {string[]} */
const packagesToBuild = ["standardMod", "gameCore"]

for (const dirPath of packagesToBuild) {
    const fullDirpath = path.join(__dirname, dirPath)
    const configFile = path.join(fullDirpath, "vite.config.ts")
    await build({configFile})
}