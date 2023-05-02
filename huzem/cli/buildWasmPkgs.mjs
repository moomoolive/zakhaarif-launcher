import path from "path"
import {fileURLToPath} from 'url'
import fsSync from "fs"
import fs from "fs/promises"
import toml from "toml"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const rustPackagePaths = [
    "../src/gameCore/engine_wasm_core"
]

const PUBLIC_BINARY_FOLDER = "wasm-lib"
const BINARY_PATH = `../public/${PUBLIC_BINARY_FOLDER}`
const BINARY_MAP_PATH = "../src/wasmBinaryPaths.mjs"
const DAEMON_NAME = "[🪚 build wasm pkg]"
const CARGO_FILE = "Cargo.toml"

const publicBinaryFolderPath = path.join(__dirname, BINARY_PATH)

console.info(DAEMON_NAME, "building lib folder...")
if (!fsSync.existsSync(publicBinaryFolderPath)) {
    fsSync.mkdirSync(publicBinaryFolderPath)
}

const WASM_PACK_OUTPUT_DIR = "pkg"
const WASM_PACK_WASM_PREFIX = "_bg.wasm"

/** @type {Record<string, string>} */
const wasmBinaryMap = {}

console.info(DAEMON_NAME, "starting to compile packages...")
await Promise.all(rustPackagePaths.map(async (relativePath) => {
    const fullRelativePath = path.join(__dirname, relativePath)
    const pkgName = fullRelativePath.split("/").at(-1) || ""
    const pkgFile = path.join(
        fullRelativePath,
        CARGO_FILE
    )
    const cargoTomlFile = await fs.readFile(pkgFile, {
        encoding: "utf-8"
    })
    /** @type {{package?: { version?: string }}} */
    const cargoToml = toml.parse(cargoTomlFile)
    const versionString = cargoToml.package?.version || "0.1.0"
    const wasmBinaryPath = path.join(
        fullRelativePath, 
        WASM_PACK_OUTPUT_DIR,
        pkgName + WASM_PACK_WASM_PREFIX
    )
    const binaryFile = await fs.readFile(wasmBinaryPath)
    const versionHash = `v${versionString.replace(/\./g, "_")}`
    const binaryName = `${pkgName}.${versionHash}.wasm`
    const outPath = path.join(publicBinaryFolderPath, binaryName)
    await fs.writeFile(outPath, binaryFile)
    const relativeUrl = `/${PUBLIC_BINARY_FOLDER}/${binaryName}`
    wasmBinaryMap[pkgName] = relativeUrl
    console.info(DAEMON_NAME, `successfully compiled pkg "${pkgName}"!`)
}))

const prettyPrintedMap = JSON.stringify(wasmBinaryMap, null, "\t")
console.info(DAEMON_NAME, "created wasm map", prettyPrintedMap)

const binaryMap = `
// AUTO-GENERATED - DO NOT MANUALLY UPDATE
/** @type {${JSON.stringify(wasmBinaryMap)}} */
export const wasmMap = ${prettyPrintedMap}
`.trim()

console.info(DAEMON_NAME, "writing map to disk...")
await fs.writeFile(
    path.join(__dirname, BINARY_MAP_PATH),
    binaryMap,
    {encoding: "utf-8"}
)