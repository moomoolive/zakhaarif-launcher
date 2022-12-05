import type {CrateVersion, NullField} from "./consts"

export type RepoType = "git" | "other" | NullField

export type InvalidationStrategy = "url-diff" | "purge" | NullField

// this manifest format is heavily inspired by
// Node's "package.json" format
export type CodeManifest = {
    uuid: string
    crateVersion: CrateVersion
    name: string
    version: string
    entry: string
    files: {name: string, bytes: number}[]

    // optional fields
    invalidation?: InvalidationStrategy
    description?: string
    authors?: {name: string, email?: string, url?: string}[]
    crateLogoUrl?: string
    keywords?: string[]
    license?: string
    repo?: {type: RepoType, url: string}
    homepageUrl?: string
}

export type AppEntryPointers = {
    readonly entryRecords: string, 
    entries: {url: string, originalUrl: string}[]
}
