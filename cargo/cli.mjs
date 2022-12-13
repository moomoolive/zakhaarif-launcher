import Filehound from "filehound"
import {nanoid} from "nanoid"
import fs from "fs/promises"
import {z} from "zod"
import semver from "semver"

const fallbackIdFile = "cargo.id.mjs"
const CRATE_VERSION = "0.1.0"
const NULL_FIELD = "none"
const ID_LENGTH = 35
const generatedFiles = ["cargo.json", "cargo.mini.json"]
const CONFIG_FILE = "cargo.config.mjs"
const EXPORTED_ID = "cargoId"

const stripRelativePath = (url = "") => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else {
        return url
    }
}

const dirName = (dir = "") => {
    let str = dir
    if (dir.startsWith("/")) {
        str = str.slice(1)
    }
    if (dir.endsWith("/")) {
        return str
    } else {
        return str + "/"
    }
}

const main = async () => {
    const filehound = Filehound.create()
    const workingDir = process.cwd()

    const {config} = await (async (cwd = "") => {
        try {
            return await import(`${cwd}/${CONFIG_FILE}`)
        } catch {
            throw new Error(`couldn't find ${CONFIG_FILE}`)
        }
    })(workingDir)

    const parsedConfig = (() => {
        const schema = z.object({
            buildDir: z.string().min(1, {message: "buildDir must be 1 or more characters"}),
            ignore: z.array(z.string()).default([]),
            generateMiniCargo: z.boolean().default(true),
            uuid: z.string().default(""),
            entry: z.string().default(""),
            version: z.string().default(""),
            name: z.string().default(""),
            invalidation: z.string().default(""),            
            description: z.string().default(""),         
            authors: z.array(z.object({
                name: z.string().default(""),
                email: z.string().default(""),
                url: z.string().default(""),
            })).default([]),         
            crateLogoUrl: z.string().default(""),         
            keywords: z.array(z.string()).default([]),         
            license: z.string().default(""),
            repo: z.object({
                type: z.string(),
                ur: z.string()
            }).optional(),        
            homepageUrl: z.string().default(""),         
        })
        const parsed = schema.safeParse(config)
        return parsed
    })()

    if (!parsedConfig.success) {
        console.error(parsedConfig.error)
        return
    }

    const parsedPackageJson = await (async () => {
        try {
            const packageJson = await fs.readFile(
                `${workingDir}/package.json`,
                {encoding: "utf-8"}
            )
            const jsObject = JSON.parse(packageJson)
            const schema = z.object({
                name: z.string().default(""),
                version: z.string().default(""),
                description: z.string().default(""),
                keywords: z.array(z.string()).default([]),
                homepage: z.string().default(""),
                license: z.string().default(""),
                contributors: z.array(z.object({
                  name: z.string().default(""),  
                  email: z.string().default(""),  
                  url: z.string().default(""),  
                })).default([]),
                repository: z.object({
                    type: z.string(),
                    url: z.string(),
                }).optional(),
            })
            const parsed = schema.parse(jsObject)
            return parsed
        } catch {
            return null
        }
    })()

    const mergedConfig = (() => {
        const pJson = parsedPackageJson
        const config = parsedConfig.data
        const authors = []
        const pAuthors = pJson?.contributors || []
        const cAuthors = config.authors || []
        authors.push(...pAuthors, ...cAuthors)
        const keywords = []
        const pKeywords = pJson?.keywords || []
        const cKeywords = config.keywords || []
        keywords.push(...pKeywords, ...cKeywords)
        return {
            uuid: config.uuid || NULL_FIELD,
            crateVersion: CRATE_VERSION,
            name: config.name || pJson?.name || "default-pkg-name",
            version: config.version || pJson?.version || "0.1.0-alpha.0",
            entry: config.entry || "index.html",
            // optional fields
            ...(config.invalidation ? {invalidation: config.invalidation} : {}),
            ...(config.description || pJson?.description ? {description: config.description || pJson?.description} : {}),
            ...(authors.length > 0 ? {authors} : {}),
            ...(config.crateLogoUrl ? {crateLogoUrl: config.crateLogoUrl} : {}),
            ...(keywords.length > 0 ? {keywords} : {}),
            ...(config.license || pJson?.license ? {license: config.license || pJson?.license} : {}),
            ...(config.repo || pJson?.repository ? {repo: config.repo || pJson?.repository} : {}),
            ...(config.homepageUrl || pJson?.homepage ? {homepageUrl: config.homepageUrl || pJson?.homepage} : {}),
        }
    })()

    const {buildDir, ignore} = parsedConfig.data

    const {uuid, entry: configEntry, version} = mergedConfig

    if (typeof buildDir !== "string" || buildDir.length < 1) {
        console.error("build directory must be provided. build halted")
        return
    }

    if (!semver.valid(version)) {
        console.error("inputed version is not a valid semantic version. For more information check out: https://docs.npmjs.com/cli/v9/configuring-npm/package-json#version")
        return
    }

    const generatedId = await (async (id = "") => {
        const isNull = id === NULL_FIELD
        if (typeof isNull === "string" && id.length === ID_LENGTH) {
            return id
        }
        // if no id in config file
        // check if already generated id file
        try {
            const f = await import(`${workingDir}/${fallbackIdFile}`)
            const exportedId = f[EXPORTED_ID]
            if (typeof exportedId !== "string") {
                throw new Error("file has changed??")
            }
            /** @type {string} */
            return exportedId
        } catch {}
        // if id file doesn't exist create one
        const newId = nanoid(ID_LENGTH)
        await fs.writeFile(
            fallbackIdFile, 
            `/* auto-generated, do not modify. */\nexport const ${EXPORTED_ID} = "${newId}"`.trim()
        )
        console.info(`📒 auto-generated uuid (${fallbackIdFile}) for cargo as uuid was not specified in ${CONFIG_FILE}`)
        return newId
    })(uuid)

    // create list of files for cargo
    const files = await filehound
        .paths(buildDir)
        .discard([...ignore, ...generatedFiles])
        .find()
    const fileMeta = await Promise.all(files.map((name) => fs.stat(name)))
    const buildDirName = dirName(buildDir)
    const filesWithoutBuildDir = files.map((n) => n.split(buildDirName)[1])
    /** @type {Record<string, boolean>} */
    const fileMap = {}
    for (const file of filesWithoutBuildDir) {
        fileMap[file] = true
    }
    const entry = stripRelativePath(configEntry) || "index.html"
    if (!fileMap[entry] && files.length > 0) {
        console.error(`entry file ${entry}${configEntry ? "" : " (default entry)"} is not one of the files in build directory ${buildDir}.`)
        return
    }

    // generate cargos
    const miniPkg = {version}
    const pkg = {
        ...mergedConfig,
        uuid: generatedId,
        entry,
        files: filesWithoutBuildDir.map((n, i) => {
            return {
                name: n, 
                bytes: fileMeta[i]?.size || 0
            }
        })
    }
    const outDirName = dirName(buildDir)
    await Promise.all([
        fs.writeFile(
            outDirName + generatedFiles[1],
            JSON.stringify(miniPkg)
        ),
        fs.writeFile(
            outDirName + generatedFiles[0],
            JSON.stringify(pkg)
        )
    ])
    console.info(`✅ generated mini-cargo (${outDirName}${generatedFiles[1]})`)
    console.info(`✅ cargo file generate (${outDirName}${generatedFiles[0]}) with params:\n`, pkg)
}

main()