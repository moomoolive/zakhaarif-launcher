#!/usr/bin/env node
import fs from "fs/promises"

const CREDITS_OUTPUT = "public/credits.compiled.json"

console.info("building credits file...")

/**
 * 
 * @param {string} packageJsonPath 
 * @returns {Promise<Array<{name: string, type: string, url: string}>>}
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
        "npm"
    ].sort()
    
    const npmDependenciesWithLinks = npmDependencies.map((dependency) => {
        return {
            name: dependency,
            type: "npm",
            url: `https://npmjs.com/package/${dependency}`
        }
    })
    
    console.info("found", npmDependencies.length, `npm dependencies @ ${packageJsonPath}`)
    return npmDependenciesWithLinks
}

const getRuntimesUsed = () => {
    const runtimes = [
        {name: "Node.js", type: "node", url: "https://nodejs.org/en/"}
    ]
    console.log("found", runtimes.length, "runtimes")
    return runtimes
}

/** @type {Array<{name: string, type: string, url: string}>} */
const allCredits = [
    ...getRuntimesUsed(),
    ...(await getNpm("package.json")),
    ...(await getNpm("huzem/package.json")),
]

await fs.writeFile(CREDITS_OUTPUT, JSON.stringify(allCredits), {
    encoding: "utf-8"
})