export const MANIFEST_NAME = "cargo.json"
export const MANIFEST_MINI_NAME = "cargo.mini.json"
export const NULL_FIELD = "none"
export const ALL_CRATE_VERSIONS = {"0.1.0": 1} as const
export type CrateVersion = keyof typeof ALL_CRATE_VERSIONS
export const LATEST_CRATE_VERSION = "0.1.0"
type NullField = typeof NULL_FIELD
export type RepoType = "git" | "other" | NullField

export type ValidDefaultStrategies = ("url-diff" | "purge")
export type InvalidationStrategy = ValidDefaultStrategies | "default"

// this manifest format is heavily inspired by
// Node's "package.json" format
export type CargoManifest = {
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

export type MiniCodeManifest = { version: string }