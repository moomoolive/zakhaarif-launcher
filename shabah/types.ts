import type {CrateVersion, NullField} from "./consts"

export type RepoType = "git" | "other" | NullField

export type InvalidationStrategy = "url-diff" | "purge" | "default"

// this manifest format is heavily inspired by
// Node's "package.json" format
export type CodeManifest = {
    uuid: string
    crateVersion: CrateVersion
    name: string
    version: string
    entry: string
    files: Array<{
        name: string, 
        bytes: number,
        invalidation?: InvalidationStrategy
    }>

    // optional fields
    invalidation?: InvalidationStrategy
    description?: string
    authors?: Array<{
        name: string, 
        email?: string, 
        url?: string
    }>
    crateLogoUrl?: string
    keywords?: string[]
    license?: string
    repo?: {type: RepoType, url: string}
    homepageUrl?: string
}

export type CodeManifestSafe = Required<CodeManifest> & {
    authors: Array<{
        name: string
        email: string 
        url: string
    }>,
    files: Array<{
        name: string
        bytes: number
        invalidation: InvalidationStrategy
    }>
}

export type MiniCodeManifest = Pick<CodeManifestSafe, (
    "version"
)>

export type AppEntryPointers = {
    readonly entryRecords: string, 
    entries: {
        url: string, 
        originalUrl: string
        name: string
        id: number
        bytes: number
    }[]
}

export type ShabahCliConfig = {
    buildDir?: string
    ignore?: string[]
    generateMiniCargo?: boolean
}
