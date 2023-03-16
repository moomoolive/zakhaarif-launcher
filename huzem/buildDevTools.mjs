import {build} from "vite"
import path from 'path'
import {fileURLToPath} from 'url'
import fs from "fs/promises"

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const devToolBase = "src/zakhaarif-dev-tools"
const DEV_TOOL_NAME = "[🔧 dev-tools]"

console.info(`${DEV_TOOL_NAME} building dev-tools package...`)

// https://vitejs.dev/config/
await build({
    configFile: path.join(__dirname, devToolBase, "vite.config.ts"),
})

// dev dependencies only
const dependencies = [
    "huzma",
    "w-worker-rpc"
]

console.info(`${DEV_TOOL_NAME} generating package.json...`)

const devDependencies = await (async () => {
    const basePath = path.join(__dirname, "package.json")
    const basePackageJsonFile = await fs.readFile(basePath, {
        encoding: "utf-8"
    })
    /** @type {import("type-fest").PackageJson} */
    const {devDependencies = {}} = JSON.parse(basePackageJsonFile)
    /** @type {Record<string, string>} */
    const packageDependencies = {}
    for (const dep of dependencies) {
        const targetVersion = devDependencies[dep]
        if (!targetVersion) {
            throw new Error(`${DEV_TOOL_NAME} dependency "${dep}" was not found in packageJson @ ${basePath}`)
        }
        packageDependencies[dep] = targetVersion
    }
    return packageDependencies
})()

/** @type {import("type-fest").PackageJson} */
const generatedPackageJson = {
    name: "zakhaarif-dev-tools",
    version: "0.1.8",
    description: "developer tools to help create extension & mods for zakhaarif",
    type: "module",
    author: "mostafa elbannan",
    license: "MIT",
    main: "index.js",
    types: "index.d.ts",
    devDependencies,
    keywords: ["zakhaarif", "dev", "mods", "extensions"],
    homepage: "https://github.com/moomoolive/zakhaarif-launcher",
    repository: {
        type: "git",
        url: "https://github.com/moomoolive/zakhaarif-launcher",
    },
    bugs: {
        url: "https://github.com/moomoolive/zakhaarif-launcher/issues"
    },
}

const outDir = devToolBase + "/build"

const PRETTY_PRINT = "\t"

await fs.writeFile(
    path.join(__dirname, outDir, "package.json"), 
    JSON.stringify(generatedPackageJson, null, PRETTY_PRINT),
    {encoding: "utf-8"}
)

console.info(`${DEV_TOOL_NAME} copying license and README`)

const copyFiles = ["LICENSE", "README.md"]
await Promise.all(copyFiles.map(async (filename) => {
    const fullPath = path.join(__dirname, devToolBase, filename)
    const fileContents = await fs.readFile(fullPath, {encoding: "utf-8"})
    const writePath = path.join(__dirname, outDir, filename)
    await fs.writeFile(writePath, fileContents, {encoding: "utf-8"})
}))

console.info(`${DEV_TOOL_NAME} package is ready to be deployed`)