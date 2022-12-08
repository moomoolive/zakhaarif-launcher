export const MANIFEST_NAME = "cargo.json"
export const MANIFEST_MINI_NAME = "cargo.mini.json"
export const NULL_FIELD = "none"
export const ALL_CRATE_VERSIONS = {
    "0.1.0": 1
} as const
export type CrateVersion = keyof typeof ALL_CRATE_VERSIONS
export const LATEST_CRATE_VERSION = "0.1.0"
type NullField = typeof NULL_FIELD
export const UUID_LENGTH = 35
export const reservedIds = {
    "std-app": "XRFCvi60nXcM0ZPiEupkeW9eNmoPi9ybk_S",
    "std": "nZgOO5v-13AccpgJoAAzz6YWrGhM2bNZg5s"
} as const
export type ReservedUuids = typeof reservedIds[keyof typeof reservedIds]
export type ReservedPackageNames = keyof typeof reservedIds
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