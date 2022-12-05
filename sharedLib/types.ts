import type {CrateVersion, NullField} from "./consts"

export type RepoType = "git" | "other" | NullField

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
    description?: string
    authors?: {name: string, email?: string, url?: string}[]
    crateLogoUrl?: string
    keywords?: string[]
    license?: string
    repo?: {type: RepoType, url: string}
    homepageUrl?: string
}

export type AppEntryPointer = {
    appShell: {
        url: string
        originalUrl: string
    }
}

export type AppExtension = {
    onInit: (rootElement: HTMLElement) => void,
    onDestroy?: () => void
}

export interface AppExtensionModule {
    pkg: AppExtension
}

export type GamePackage = {
    onInit: () => void
}

export type GameModule = {
    pkg: GamePackage
}