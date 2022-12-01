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