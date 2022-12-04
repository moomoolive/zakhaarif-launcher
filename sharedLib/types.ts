export type CodeManifest = {
    uuid: string
    schemaVersion: string
    name: string
    version: string
    description?: string
    authors?: string
    displayPictureUrl?: string
    entry: string
    files: {name: string, bytes: string}[]
}

export type PackageRecord = {
    id?: number
    uuid: string
    recordVersion: string
    name: string
    type: "mod" | "extension"
    version: string
    description: string
    authors: string
    displayPictureUrl: string
    entry: string
    files: {name: string, bytes: string}[]
    meta: {
        totalSize: number
        source: string
        originalUrl: string
    }
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