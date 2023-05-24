import {exec} from "child_process"
import fs from "fs/promises"
import path from "path"
import {fileURLToPath} from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const OUT_DIR = "pkg"
const command = "wasm-pack build"
// reference: https://rustwasm.github.io/docs/wasm-pack/commands/build.html
const args = `-t web --release --out-dir ${OUT_DIR}`
const daemon = "[📇 Wasm Compile]"

console.info(daemon, "starting to compile engine core")
/** @type {boolean} */
const status = await new Promise((resolve) => {
    exec(`${command} ${args}`, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`)
            resolve(false)
            return
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`)
            resolve(true)
            return
        }
        console.log(`stdout: ${stdout}`)
        resolve(true)
    })
})

if (!status) {
    console.error(`failed to compile wasm binary`)
    process.exit(1)
}

const excessfiles = ["package.json", "README.md", ".gitignore"]
const dirpath = path.join(__dirname, OUT_DIR)
console.info(daemon, `removing excess files (${excessfiles.length} files)`)
await Promise.all(excessfiles.map(async (name) => {
    const targetpath = path.join(dirpath, name)
    return fs.rm(targetpath)
}))
console.info(daemon, `successfully deleted excess files`)
