#!/usr/bin/env node
import fs from "fs/promises"
import toml from "toml"

const CREDITS_OUTPUT = "public/credits.compiled.json"

console.info("building credits file...")

/**
 * @typedef {import("../src/lib/types/app").Acknowledgment} AcknowledgementElement
 */

/**
 * @param {string} cargoTomlPath
 */
const getCargo = async (cargoTomlPath) => {
    const cargoTomlText = await fs.readFile(cargoTomlPath, {
        encoding: "utf-8"
    })
    /** @type {{dependencies?: Record<string, unknown>}} */
    const parsedCargoToml = toml.parse(cargoTomlText)
    const allNames = Object.keys(parsedCargoToml.dependencies || {})
    /** @type {AcknowledgementElement[]} */
    const dependencies = allNames.map((name) => ({
        name,
        type: "crates.io",
        url: `https://crates.io/crates/${name}`
    }))
    return dependencies
}

const getAllCargoDependencies = async () => {
    const cargoPaths = [
        "huzem/src/gameCore/engine_allocator/Cargo.toml"
    ]
    const allDependencies = await Promise.all(
        cargoPaths.map((path) => getCargo(path))
    )
    const allCratesioDeps = allDependencies.flat()
    /** @type {AcknowledgementElement[]} */
    const compiled = []
    /** @type {Map<string, boolean>} */
    const packageMap = new Map()
    for (const pkg of allCratesioDeps) {
        if (packageMap.has(pkg.name)) {
            continue
        }
        packageMap.set(pkg.name, true)
        compiled.push(pkg)
    }
    console.info("found", compiled.length, `crates.io dependencies @ ${cargoPaths.join(", ")}`)
    return compiled
}

/**
 * @param {string} packageJsonPath
 */
const getNpm = async (packageJsonPath) => {
    const packagejsonText = await fs.readFile(packageJsonPath,
        {encoding: "utf-8"}
    )
    
    /** @type {{dependencies: Record<string, string>, devDependencies: Record<string, string>}} */
    const packageJson = JSON.parse(packagejsonText)
    
    const {dependencies, devDependencies} = packageJson
    
    const npmDependencies = [
        ...Object.keys(dependencies),
        ...Object.keys(devDependencies),
        "npm",
        // these ECSs helped inform
        // many of the game engine descisions
        "@lastolivegames/becsy",
        "@javelin/ecs",
        "bitecs"
    ].sort()
    
    /** @type {AcknowledgementElement[]} */
    const npmDependenciesWithLinks = npmDependencies.map((dependency) => {
        return {
            name: dependency,
            type: "npm",
            url: `https://npmjs.com/package/${dependency}`
        }
    })
    return npmDependenciesWithLinks
}

const allNpmPackages = async () => {
    const pkgPaths = [
        "package.json", "huzem/package.json"
    ]
    const pkgPromises = await Promise.all(
        pkgPaths.map((pkgPath) => getNpm(pkgPath))
    )
    const allPackages = pkgPromises.flat()
    /** @type {AcknowledgementElement[]} */
    const filteredPackages = []
    /** @type {Map<string, boolean>} */
    const packageMap = new Map()
    for (const pkg of allPackages) {
        if (
            packageMap.has(pkg.name) 
            || pkg.name === "zakhaarif-huzem-internal-pkg"
        ) {
            continue
        }
        packageMap.set(pkg.name, true)
        filteredPackages.push(pkg)
    }
    console.info("found", filteredPackages.length, `npm dependencies @ ${pkgPaths.join(", ")}`)
    return filteredPackages
}

const getRuntimesUsed = () => {
    /** @type {AcknowledgementElement[]} */
    const runtimes = [
        {name: "Node.js", type: "node", url: "https://nodejs.org/en/"},
        {name: "Rust Lang", type: "rust", url: "https://www.rust-lang.org/"},
        // tons of inspiration for engine taken from
        // go - although no go code is actually used
        {name: "Go Lang", type: "go", url: "https://go.dev/"},
    ]
    console.info("found", runtimes.length, "runtimes")
    return runtimes
}

const getDocsUsed = () => {
    /** @type {AcknowledgementElement[]} */
    const docs = [
        {name: "Mozilla Developer Network", type: "mdn", url: "https://developer.mozilla.org/en-US/docs/Web"}
    ]
    console.info("found", docs.length, "doc sources")
    return docs
}

const githubProjects = () => {
    /** @type {AcknowledgementElement[]} */
    const projects = [
        {name: "flecs", type: "github", url: "https://github.com/SanderMertens/flecs"}
    ]
    console.info("found", projects.length, "github sources")
    return projects
}

/** @type {AcknowledgementElement[]} */
const allCredits = [
    ...getRuntimesUsed(),
    ...getDocsUsed(),
    ...(await allNpmPackages()),
    ...(await getAllCargoDependencies()),
    ...githubProjects(),
]

await fs.writeFile(CREDITS_OUTPUT, JSON.stringify(allCredits), {
    encoding: "utf-8"
})