import {SemVer} from "small-semver"
import {
    NULL_FIELD,
    ALL_SCHEMA_VERSIONS,
    LATEST_SCHEMA_VERSION
} from "./consts"

export {
    NULL_FIELD,
    ALL_SCHEMA_VERSIONS,
    LATEST_SCHEMA_VERSION,
    MANIFEST_FILE_SUFFIX
} from "./consts"

type ExpandedInbuiltTypes = (
    "string" 
    | "number" 
    | "bigint" 
    | "boolean" 
    | "symbol" 
    | "undefined" 
    | "function" 
    | "object" 
    | "null" 
    | "array"
)

function type(val: unknown): ExpandedInbuiltTypes {
    const t = typeof val
    if (t !== "object") {
        return t
    } else if (val === null) {
        return "null"
    } else if (Array.isArray(val)) {
        return "array"
    } else {
        return "object"
    }
}

function stripRelativePath(url: string): string {
    if (url.length < 1) {
        return ""
    }
    if (
        !url.startsWith("/")
        && !url.startsWith("./") 
        && !url.startsWith("../")
    ) {
        return url
    }
    const split = url.split("/")
    let urlStart = -1
    for (let i = 0; i < split.length; i++) {
        const path = split[i]
        if (path !== "" && path !== "." && path !== "..") {
            urlStart = i
            break
        }
    }
    if (urlStart < 0) {
        return ""
    }
    return split.slice(urlStart).join("/")
}

export type SchemaVersion = keyof typeof ALL_SCHEMA_VERSIONS
export type NullField = typeof NULL_FIELD
export type RepoType = "git" | "other" | NullField
export type ValidDefaultStrategies = ("url-diff" | "purge")
export type InvalidationStrategy = ValidDefaultStrategies | "default"

type PermissionsListRaw = ReadonlyArray<
    string | {key: string, value: Array<string> | ReadonlyArray<string>}
>

type FillEmptyPermissions<
    P extends PermissionsListRaw
> = {
    [index in keyof P]: P[index] extends string
        ?  {key: P[index], value: string[]}
        :  P[index] extends {
                key: infer Key, 
                value: Array<infer Value> | ReadonlyArray<infer Value>
        }
            ?  {key: Key, value: Value[]}
            : never
}

type FillEmptyPermissionsOptional<P extends PermissionsListRaw> = {
    [index in keyof P]: P[index] extends string
        ?  P[index] | {key: P[index], value: string[]}
        :  P[index] extends {
                key: infer Key, 
                value: Array<infer Value> | ReadonlyArray<infer Value>
        }
            ? Key | {key: Key, value: Value[]}
            : never
}

type PermissionsListOptions<
    P extends PermissionsListRaw = {key: string, value: string[]}[]
> = Array<FillEmptyPermissionsOptional<P>[number]>

export type PermissionsList<
    P extends PermissionsListRaw = {key: string, value: string[]}[]
> = Array<FillEmptyPermissions<P>[number]>

type HuzmaManifestPartial= Partial<
    Omit<HuzmaManifest, "files" | "authors" | "repo" | "permissions">
>

type ManifestOptions<
    Permissions extends PermissionsListRaw = ReadonlyArray<{key: string, value: string[]}>
> = (
    HuzmaManifestPartial & Partial<{
        authors: Array<Partial<{
            name: string, 
            email: string, 
            url: string
        }>>
        files: Array<string> | Array<Partial<{
            name: string,   
            bytes: number,
            invalidation: InvalidationStrategy
        }>>
        repo: Partial<{ type: RepoType, url: string }>
        permissions: PermissionsListOptions<Permissions>
        metadata: Record<string, string>
    }>
)

export const NULL_MANIFEST_VERSION = "0.0.0"

export class HuzmaManifest<
    Permissions extends PermissionsListRaw = ReadonlyArray<{key: string, value: string[]}>
> {
    // required fields
    schema: SchemaVersion
    name: string
    version: string
    files: Array<{
        name: string, 
        bytes: number,
        invalidation: InvalidationStrategy
    }>

    // optional fields
    entry: string
    invalidation: InvalidationStrategy
    description: string
    authors: Array<{ name: string, email: string, url: string }>
    crateLogoUrl: string
    keywords: string[]
    license: string
    repo: {type: RepoType, url: string}
    homepageUrl: string
    permissions: PermissionsList<Permissions>
    metadata: Record<string, string>

    constructor({
        schema = "0.1.0",
        name = "unspecified-name",
        version = NULL_MANIFEST_VERSION,
        files = [],

        // optionalfields
        entry = NULL_FIELD,
        invalidation = "default",
        description = NULL_FIELD,
        authors = [],
        crateLogoUrl = NULL_FIELD,
        keywords = [],
        license = NULL_FIELD,
        repo = {type: NULL_FIELD, url: NULL_FIELD},
        homepageUrl = NULL_FIELD,
        permissions = [],
        metadata = {}
    }: ManifestOptions<Permissions> = {}) {
        this.homepageUrl = homepageUrl
        this.repo = {
            type: repo?.type || "other",
            url: repo?.url || NULL_FIELD
        }
        this.license = license
        this.keywords = keywords
        this.crateLogoUrl = stripRelativePath(crateLogoUrl)
        this.authors = authors.map(({
            name = NULL_FIELD, 
            email = NULL_FIELD, 
            url = NULL_FIELD
        }) => ({
            name, email, url
        }))
        this.description = description
        this.invalidation = invalidation
        this.files = files
            .map((file) => typeof file === "string" 
                ? {name: file, bytes: 0, invalidation: "default"} as const
                : file
            )
            .map(({
                name = "", bytes = 0, invalidation = "default"
            }) => ({
                name: stripRelativePath(name), 
                bytes, 
                invalidation
            }))
        this.entry = stripRelativePath(entry)
        this.version = version
        this.name = name
        this.schema = schema
        const permissionsExpanded = permissions.map((permission) => {
            if (typeof permission === "string") {
                return {key: permission, value: []}
            }
            return permission
        }) as PermissionsList<Permissions>
        const permissionsMap = new Map<string, number>()
        const noDuplicates = permissionsExpanded.reduce((permissionsArray, next) => {
            if (permissionsMap.has(next.key as string)) {
                return permissionsArray
            }
            permissionsMap.set(next.key as string, 1)
            permissionsArray.push(next)
            return permissionsArray
        }, [] as PermissionsList<Permissions>)
        this.permissions = noDuplicates
        this.metadata = metadata
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

export type ValidatedCodeManfiest = {
    pkg: HuzmaManifest,
    errors: string [],
    semanticVersion: SemVer
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

export function validateManifest<T>(cargo: T): ValidatedCodeManfiest {
    
    const out: ValidatedCodeManfiest = {
        pkg: new HuzmaManifest(),
        errors: [],
        semanticVersion: SemVer.null()
    }
    const {pkg, errors} = out
    const c = cargo as ManifestOptions
    const baseType = type(c)
    if (baseType !== "object") {
        errors.push(`expected cargo to be type "object" got "${baseType}"`)
        return out
    }
    if (!ALL_SCHEMA_VERSIONS[c.schema || "" as SchemaVersion]) {
        errors.push(`crate version is invalid, got "${c.schema}", valid=${Object.keys(ALL_SCHEMA_VERSIONS).join()}`)
    }
    pkg.schema = c.schema || LATEST_SCHEMA_VERSION

    if (!typevalid(c, "name", "string", errors)) {}
    pkg.name = orNull(c.name)

    let semverTmp: SemVer | null
    if (!typevalid(c, "version", "string", errors)) {

    } else if (!(semverTmp = SemVer.fromString(c.version || ""))) {
        errors.push(`${c.version} is not a vaild semantic version`)
    } else {
        out.semanticVersion = semverTmp
    }
    pkg.version = orNull(c.version)

    const filesIsArray = Array.isArray(c.files)
    if (!filesIsArray) {
        errors.push(`files should be an array, got "${type(c.files)}"`)
    }
    
    const fileRecord: Record<string, boolean> = {}
    const files = !filesIsArray ? [] : c.files || []
    for (let i = 0; i < files.length; i++) {
        const preFile = files[i]
        if (typeof preFile === "string") {
            files[i] = {name: preFile, bytes: 0, invalidation: "default"}
        }
        const file = files[i] as Partial<{name: string, bytes: 0, invalidation: string}>
        if (type(file) !== "object") {
            errors.push(`file ${i} is not an object. Expected an object with a "name" field, got ${type(file)}`)
            break
        }
        if (
            typeof file?.name !== "string" 
            || typeof (file?.invalidation || "") !== "string" 
        ) {
            errors.push(`file ${i} is not a valid file format, file.name and file.invalidation must be a string`)
            break
        }
        const stdName = stripRelativePath(file.name)
        if (
            // ignore cross-origin
            stdName.startsWith("https://")
            || stdName.startsWith("http://")
            // ignore duplicate files
            || fileRecord[stdName]
        ) {
            break
        }
        fileRecord[stdName] = true
        pkg.files.push({
            name: stdName,
            bytes: Math.max(
                typeof file.bytes === "number" ? file.bytes : 0, 
                0
            ),
            invalidation: toInvalidation(
                file?.invalidation || "default"
            )
        })
    }

    const permissions = c.permissions || []
    if (!Array.isArray(permissions)) {
        errors.push(`permissions should be an array, got "${type(c.permissions)}"`)
    }

    const permissionsMap = new Map<string, number>()
    for (let i = 0; i < permissions.length; i++) {
        const permission = permissions[i]
        const permissionType = type(permission)
        if (permissionType !== "string" && permissionType !== "object") {
            errors.push(`permission should be a string or object with "key" & "value" properties. Permission ${i} type=${type(permission)}`)
        }

        if (typeof permission === "string") {
            if (permissionsMap.has(permission)) {
                continue
            }
            permissionsMap.set(permission, 1)
            pkg.permissions.push({key: permission, value: []})
            continue
        }
        if (permissionType !== "object") {
            continue
        }
        if (typeof permission.key !== "string") {
            errors.push(`permission ${i} property "key" is not a string. got = ${type(permission.key)}`)
            continue
        }
        const value = permission.value || []
        if (!Array.isArray(value)) {
            errors.push(`permission ${i} property "value" is not an array. got = ${type(permission.key)}`)
            continue
        }
        if (permissionsMap.has(permission.key)) {
            continue
        }
        permissionsMap.set(permission.key, 1)
        pkg.permissions.push({
            key: permission.key, 
            value: value.filter((val) => typeof val === "string")
        })
    }

    pkg.entry = orNull(c.entry)
    if (pkg.entry !== NULL_FIELD && !fileRecord[pkg.entry]) {
        errors.push(`entry must be one of package listed files, got ${pkg.entry}`)
    }

    pkg.invalidation = typeof c.invalidation === "string"
        ? toInvalidation(c.invalidation)
        : "default"
    pkg.description = orNull(c.description)
    pkg.authors = (c.authors || [])
        .filter(a => typeof a?.name === "string")
        .map(({name = "", email, url}) => ({
            name,  email: orNull(email), url: orNull(url)
        }))
    pkg.crateLogoUrl = stripRelativePath(orNull(c.crateLogoUrl))
    pkg.keywords = (c.keywords || [])
        .filter(w => typeof w === "string")
    pkg.license = orNull(c.license)
    pkg.repo.type = orNull(c.repo?.type)
    pkg.repo.url = orNull(c.repo?.url)
    pkg.homepageUrl = orNull(c.homepageUrl)

    c.metadata = c.metadata || {}
    if (type(c.metadata) !== "object") {
        errors.push(`metadata should be a record of strings, got "${type(c.metadata)}"`)
        c.metadata = {}
    }

    const meta: Record<string, string> = {}
    const candidate = c.metadata || {}
    const metaKeys = Object.keys(c.metadata || {})
    for (let i = 0; i < metaKeys.length; i++) {
        const key = metaKeys[i]
        const value = candidate[key]
        if (typeof value !== "string") {
            errors.push(`meta should be a record of strings, got type "${type(value)}" for property "${key}" of meta`)
            continue
        }
        meta[key] = value
    }
    pkg.metadata = meta
    return out
}

export type ManifestUpdateResponse = {
    oldManifest: ValidatedCodeManfiest
    newManifest: ValidatedCodeManfiest
    updateAvailable: boolean
}

export function manifestIsUpdatable(
    newManifest: unknown, 
    oldManifest: unknown
): ManifestUpdateResponse {
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

class HuzmaUpdateDetails {
    add: FileRef[]
    delete: FileRef[]

    constructor(addFiles: FileRef[], deleteFiles: FileRef[]) {
        this.add = addFiles
        this.delete = deleteFiles
    }
}

export function diffManifestFiles(
    newCargo: HuzmaManifest, 
    oldCargo: HuzmaManifest,
    defaultInvalidation: ValidDefaultStrategies
): HuzmaUpdateDetails {
    const updates = new HuzmaUpdateDetails([], [])
    const newFiles: Record<string, ValidDefaultStrategies> = {}
    for (let i = 0; i < newCargo.files.length; i++) {
        const {name, invalidation} = newCargo.files[i]
        if (
            newCargo.entry !== NULL_FIELD 
            && name === newCargo.entry
            && invalidation === "default"
        ) {
            newFiles[name] = "purge"
            continue
        }
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