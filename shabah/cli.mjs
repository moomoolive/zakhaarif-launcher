import Filehound from "filehound"
import {nanoid} from "nanoid"
import fs from "fs/promises"

const fallbackIdFile = "id.shabah.json"
const defaultVersion = "0.1.0-beta.0"
const defaultName = "default-pkg-name"
const CRATE_VERSION = "0.1.0"
const NULL_FIELD = "none"
const ID_LENGTH = 35
const generatedFiles = ["cargo.json", "cargo.mini.json"]
const CONFIG_FILE = "shabah.config.mjs"

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

    const {
        buildDir,
        ignore = [],
        generateMiniCargo = true,
        fillMissingFieldsFromPackageJson = true,
        uuid = NULL_FIELD,
        entry: configEntry,
        name = defaultName,
        version = defaultVersion,
    } = config

    if (typeof buildDir !== "string" || buildDir.length < 1) {
        throw new Error("build directory must be provided")
    }

    const generatedId = await (async (id = "") => {
        const isNull = id === NULL_FIELD
        if (typeof isNull === "string" && id.length === ID_LENGTH) {
            return id
        }
        // if no id in config file
        // check if already generated id file
        try {
            const f = await fs.readFile(fallbackIdFile, {encoding: "utf-8"})
            /** @type {string} */
            return JSON.parse(f)
        } catch {}
        // if id file doesn't exist create one
        const newId = nanoid(ID_LENGTH)
        await fs.writeFile(
            fallbackIdFile, 
            JSON.stringify(newId)
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
        throw new Error(`entry file ${entry}${configEntry ? "" : " (default entry)"} is not one of the files in build directory ${buildDir}.`)
    }

    // generate cargos
    const miniPkg = {version}
    const pkg = {
        uuid: generatedId,
        crateVersion: CRATE_VERSION,
        name,
        version,
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