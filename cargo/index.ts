import {SemVer} from "../nanoSemver/index"
import {
    NULL_FIELD, 
    //CodeManifestSafe, 
    UUID_LENGTH,
    CodeManifest,
    ALL_CRATE_VERSIONS,
    LATEST_CRATE_VERSION
} from "./consts"
import {
    InvalidationStrategy, 
    CrateVersion,
    RepoType,
    ValidDefaultStrategies
} from "./consts"
import {type} from "../betterTypeof/index"

type CodeManifestUnsafe = (Partial<CodeManifest> & Partial<{
    authors: Array<Partial<{
        name: string, 
        email: string, 
        url: string
    }>>
    files: Array<Partial<{
        name: string, 
        bytes: number,
        invalidation: InvalidationStrategy
    }>>
    repo: Partial<{type: RepoType, url: string}>
}>)

export const NULL_MANIFEST_VERSION = "0.0.0"

export class CodeManifestSafe {
    static readonly UUID_LENGTH = UUID_LENGTH

    uuid: string
    crateVersion: CrateVersion
    name: string
    version: string
    entry: string
    files: Array<{
        name: string, 
        bytes: number,
        invalidation: InvalidationStrategy
    }>

    // optional fields in Code Manifest
    invalidation: InvalidationStrategy
    description: string
    authors: Array<{
        name: string, 
        email: string, 
        url: string
    }>
    crateLogoUrl: string
    keywords: string[]
    license: string
    repo: {type: RepoType, url: string}
    homepageUrl: string

    constructor({
        uuid = "", 
        crateVersion = "0.1.0",
        name = "unspecified-name",
        version = NULL_MANIFEST_VERSION,
        entry = "",
        files = [],

        // optionalfields
        invalidation = "default",
        description = NULL_FIELD,
        authors = [],
        crateLogoUrl = NULL_FIELD,
        keywords = [],
        license = NULL_FIELD,
        repo = {type: NULL_FIELD, url: NULL_FIELD},
        homepageUrl = NULL_FIELD
    }: CodeManifestUnsafe = {}) {
        this.homepageUrl = homepageUrl
        this.repo = {
            type: repo?.type || "other",
            url: repo?.type || ""
        }
        this.license = license
        this.keywords = keywords
        this.crateLogoUrl = crateLogoUrl
        this.authors = authors.map(({
            name = NULL_FIELD, 
            email = NULL_FIELD, 
            url = NULL_FIELD
        }) => ({
            name, email, url
        }))
        this.description = description
        this.invalidation = invalidation
        this.files = files.map(({name = "", bytes = 0, invalidation = "default"}) => ({
            name, bytes, invalidation
        }))
        this.entry = entry
        this.version = version
        this.name = name
        this.crateVersion = crateVersion
        this.uuid = uuid
    }

    clone() {
        const copy = new CodeManifestSafe({...this})
        copy.files = copy.files.map(el => ({...el}))
        copy.authors = copy.authors.map(el => ({...el}))
        copy.keywords = [...copy.keywords]
        copy.repo = {...copy.repo}
        return copy
    }

    toMini() {
        const {version} = this
        return {version}
    }
}

const orNull = <T extends string>(str?: T) => typeof str === "string" ? str || NULL_FIELD : NULL_FIELD

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

export const dummyManifest = () => ({
    pkg: new CodeManifestSafe(), 
    errors: [] as string[], 
    semanticVersion: SemVer.null()
})

export type ValidatedCodeManfiest = ReturnType<typeof dummyManifest>

const stripRelativePath = (url: string) => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else {
        return url
    }
}

const toInvalidation = (invalidation: string) => {
    switch (invalidation) {
        case "purge":
        case "url-diff":
            return invalidation
        default:
            return "default"
    }
}

export const validateMiniCargo = <T>(miniCargo: T) => {
    const out = {
        miniPkg: {version: "0.1.0-prealpha.1"},
        errors: [] as string[],
        semanticVersion: SemVer.null()
    }
    const miniC = miniCargo as ReturnType<CodeManifestSafe["toMini"]>
    const baseType = type(miniC)
    if (baseType !== "object") {
        out.errors.push(`expected mini cargo to be type "object" got "${baseType}"`)
        return out
    }
    
    if (!typevalid(miniC, "version", "string", out.errors)) {
        return out
    }
    out.miniPkg.version = miniC.version

    const semver = SemVer.fromString(miniC.version)
    if (!semver) {
        out.errors.push(`${miniC.version} is not a vaild semantic version`)
        return out
    }
    out.semanticVersion = semver
    return out
}

export type ValidatedMiniCargo = ReturnType<typeof validateMiniCargo>

export const validateManifest = <T>(cargo: T) => {
    const out = dummyManifest()
    const {pkg, errors} = out
    const c = cargo as CodeManifest
    const baseType = type(c)
    if (baseType !== "object") {
        errors.push(`expected cargo to be type "object" got "${baseType}"`)
        return out
    }

    if (!typevalid(c, "uuid", "string", errors)) {

    } else if (c.uuid.length < UUID_LENGTH) {
        errors.push(`uuid should be ${UUID_LENGTH} characters got ${c.uuid.length} characters`)
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

    if (!typevalid(c, "name", "string", errors)) {}
    pkg.name = orNull(c.name)

    let semverTmp: SemVer | null
    if (!typevalid(c, "version", "string", errors)) {

    } else if (!(semverTmp = SemVer.fromString(c.version))) {
        errors.push(`${c.version} is not a vaild semantic version`)
    } else {
        out.semanticVersion = semverTmp
    }
    pkg.version = orNull(c.version)

    const fIsArray = Array.isArray(c.files)
    if (!fIsArray) {
        errors.push(`files should be an array, got "${typeof c.files}"`)
    }
    
    const fileRecord: Record<string, boolean> = {}
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
        const stdName = stripRelativePath(fi.name)
        if (
            // ignore cross-origin
            stdName.startsWith("https://")
            || stdName.startsWith("http://")
            // ignore duplicate files
            || fileRecord[stdName]) {
            break
        }
        fileRecord[stdName] = true
        pkg.files.push({
            name: stdName,
            bytes: Math.max(fi.bytes, 0),
            invalidation: toInvalidation(
                fi?.invalidation || "default"
            )
        })
    }

    if (typevalid(c, "entry", "string", errors)) {}
    pkg.entry = c.entry || ""
    if (!fileRecord[pkg.entry] && pkg.files.length > 0) {
        errors.push(`entry must be one of package listed files, got ${pkg.entry}`)
    }

    pkg.invalidation = typeof c.invalidation === "string"
        ? toInvalidation(c.invalidation)
        : "default"
    pkg.description = orNull(c.description)
    pkg.authors = (c.authors || [])
        .filter(a => typeof a?.name === "string")
        .map(({name, email, url}) => ({
            name,  email: orNull(email), url: orNull(url)
        }))
    pkg.crateLogoUrl = orNull(c.crateLogoUrl)
    pkg.keywords = (c.keywords || [])
        .filter(w => typeof w === "string")
    pkg.license = orNull(c.license)
    pkg.repo.type = orNull(c.repo?.type)
    pkg.repo.url = orNull(c.repo?.url)
    pkg.homepageUrl = orNull(c.homepageUrl)
    return out
}

export const cargoIsUpdatable = (
    newManifest: unknown, 
    oldManifest: unknown
) => {
    const validatedOld = validateManifest(oldManifest)
    const validatedNew = validateManifest(newManifest)
    const out = {
        oldManifest: validatedOld, 
        newManifest: validatedNew,
        updateAvailable: false
    }
    const oldErrs = out.oldManifest.errors.length > 0
    const newErrs = out.oldManifest.errors.length > 0
    if (oldErrs || newErrs) {
        return out
    }
    const oldVersionIsNull = validatedOld.pkg.version === NULL_MANIFEST_VERSION
    const newVersionIsNull = validatedNew.pkg.version === NULL_MANIFEST_VERSION
    if (oldVersionIsNull && newVersionIsNull) {
        return out
    } else if (newVersionIsNull) {
        return out
    } else if (oldVersionIsNull && !newVersionIsNull) {
        out.updateAvailable = true
        return out
    }
    const oldSemVer = validatedOld.semanticVersion
    const newSemver = validatedNew.semanticVersion
    out.updateAvailable = newSemver.isGreater(oldSemVer)
    return out
}

type FileRef = {
    name: string, 
    bytes: number
}

export class CargoUpdateDetails {
    add: FileRef[]
    delete: FileRef[]

    constructor(addFiles: FileRef[], deleteFiles: FileRef[]) {
        this.add = addFiles
        this.delete = deleteFiles
    }
}

export const diffManifestFiles = (
    newCargo: CodeManifestSafe, 
    oldCargo: CodeManifestSafe,
    defaultInvalidation: ValidDefaultStrategies
) => {
    const updates = new CargoUpdateDetails([], [])
    const newFiles: Record<string, ValidDefaultStrategies> = {}
    for (let i = 0; i < newCargo.files.length; i++) {
        const {name, invalidation} = newCargo.files[i]
        newFiles[name] = invalidation === "default"
            ? defaultInvalidation
            : invalidation
    }

    const oldFiles: Record<string, boolean> = {}
    for (let i = 0; i < oldCargo.files.length; i++) {
        const {name} = oldCargo.files[i]
        oldFiles[name] = true
    }

    for (let i = 0; i < newCargo.files.length; i++) {
        const {name, bytes} = newCargo.files[i]
        if (!oldFiles[name] || newFiles[name] === "purge") {
            updates.add.push({name, bytes})
        }
    }

    for (let i = 0; i < oldCargo.files.length; i++) {
        const {name, bytes} = oldCargo.files[i]
        const invalidation = newFiles[name]
        if (!invalidation || invalidation === "purge") {
            updates.delete.push({name, bytes})
        }
    }
    return updates
}