import {
    CodeManifest, 
    InvalidationStrategy,
    CodeManifestSafe
} from "./types"
import {
    NULL_FIELD, UUID_LENGTH,
    ALL_CRATE_VERSIONS,
    LATEST_CRATE_VERSION,
    reservedIds,
    APP_RECORDS,
    APPS_FOLDER,
    LAUNCHER_CARGO
} from "./consts"
import {SemanticVersion} from "../miniSemver/index"

export const entryRecords = (windowHref: string) => windowHref + APP_RECORDS

export const appFolder = (windowHref: string, appId: number) => windowHref + APPS_FOLDER + appId.toString() + "/"

export const launcherCargo = (windowHref: string) => windowHref + LAUNCHER_CARGO

const orNull = <T extends string>(str?: T) => typeof str === "string" ? str || NULL_FIELD : NULL_FIELD

const allElementsPassed = <T>(
    arr: T[],
    conditon: (element: T, index: number, array: T[]) => boolean 
) => {
    return arr.map(conditon).reduce((t, passed) => t && passed, true)
}

const typevalid = <T extends Record<string, unknown>>(
    obj: T,
    key: keyof T,
    type: "string" | "object",
    errs: string[]
) => {
    const t = typeof obj[key]
    if (t === type) {
        return true
    }
    errs.push(`${key as string} should be a ${type}, got "${t}"`)
    return false
}

export const validateManifest = (
    cargo: unknown, 
    allowStdPkgs: boolean
) => {
    const errors: string[] = []
    const pkg: CodeManifestSafe = {
        uuid: "",
        crateVersion: "0.1.0",
        name: "",
        version: "",
        entry: "",
        files: [],

        // optional fields
        invalidation: "url-diff",
        description: NULL_FIELD,
        authors: [],
        crateLogoUrl: NULL_FIELD,
        keywords: [],
        license: NULL_FIELD,
        repo: {type: NULL_FIELD, url: NULL_FIELD},
        homepageUrl: NULL_FIELD
    }
    const out = {pkg, errors}
    const c = cargo as CodeManifest
    if (typeof c !== "object") {
        errors.push(`expected manifest to be type "object" got "${typeof c}"`)
        return out
    } else if (Array.isArray(c)) {
        errors.push(`expected manifest to be type "object" got "array"`)
        return out
    }

    if (!typevalid(c, "uuid", "string", errors)) {

    } else if (c.uuid.length < UUID_LENGTH) {
        errors.push(`uuid should be ${UUID_LENGTH} characters got ${c.uuid.length} characters`)
    } else if (
        // check if package uuid clashes with any of the
        // reserved ids
        !allowStdPkgs && Object.values(reservedIds).includes(c.uuid as typeof reservedIds[keyof typeof reservedIds])
    ) {
        errors.push(`uuid can not be one of reserved ids: ${Object.values(reservedIds).join()}`)
    } else if (
        // check if uuid is url-safe
        encodeURIComponent(decodeURIComponent(c.uuid)) !== c.uuid
    ) {
        errors.push("uuid should only contain url safe characters")
    }
    pkg.uuid = c.uuid || NULL_FIELD

    if (!ALL_CRATE_VERSIONS[c.crateVersion]) {
        errors.push(`crate version is invalid, got "${c.crateVersion}", valid=${Object.keys(ALL_CRATE_VERSIONS).join()}`)
    }
    pkg.crateVersion = c.crateVersion || LATEST_CRATE_VERSION

    if (!typevalid(c, "name", "string", errors)) {

    } else if (
        // check if package name clashes with any of the
        // reserved names
        !allowStdPkgs && Object.keys(reservedIds).includes(c.name)
    ) {
        errors.push(`name cannot be reserved names: ${Object.keys(reservedIds).join()}`)
    }
    pkg.name = orNull(c.name)

    if (!typevalid(c, "version", "string", errors)) {

    } else if (!SemanticVersion.fromString(c.version)) {
        errors.push(`${c.version} is not a vaild semantic version`)
    }
    pkg.version = orNull(c.version)

    if (typevalid(c, "entry", "string", errors)) {}
    pkg.entry = c.entry || ""

    const fIsArray = Array.isArray(c.files)
    if (!fIsArray) {
        errors.push(`files should be an array, got "${typeof c.files}"`)
    }
    
    const f = !fIsArray ? [] : c.files
    for (let i = 0; i < f.length; i++) {
        const fi = f[i]
        if (
            typeof fi?.name !== "string" 
            || typeof fi?.bytes !== "number"
            || typeof (fi?.invalidation || "") !== "string" 
        ) {
            errors.push(`file ${i} is not a valid file format, file.name and file.invalidation must be a string, while file.bytes must be a number`)
            break
        }
        pkg.files.push({
            name: fi.name,
            bytes: fi.bytes,
            invalidation: fi?.invalidation || "default"
        })
    }

    pkg.invalidation = typeof c.invalidation === "string"
        ? c.invalidation || "default"
        : "default"
    pkg.description = orNull(c.description)
    pkg.authors = (c.authors || [])
        .filter(a => typeof a?.name === "string")
        .map(({name, email, url}) => ({
            name,  email: orNull(email), url: orNull(url)
        }))
    pkg.crateLogoUrl = orNull(c.crateLogoUrl)
    pkg.keywords = (c.keywords || []).filter(w => typeof w === "string")
    pkg.license = orNull(c.license)
    pkg.repo.type = orNull(c.repo?.type)
    pkg.repo.url = orNull(c.repo?.url)
    pkg.homepageUrl = orNull(c.homepageUrl)
    return out
}