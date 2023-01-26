import fs from "fs/promises"

const CREDITS_OUTPUT = "public/credits.json"

console.log("building credits file...")

const getNpm = async () => {
    const packagejsonText = await fs.readFile(
        "package.json",
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
    
    console.log("found", npmDependencies.length, "npm dependencies")
    return npmDependenciesWithLinks
}

/** @type {Array<{name: string, type: string, url: string}>} */
const allCredits = [...(await getNpm())]

await fs.writeFile(CREDITS_OUTPUT, JSON.stringify(allCredits), {
    encoding: "utf-8"
})