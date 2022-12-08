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
    generateMiniCargo?: boolean,
    fillMissingFieldsFromPackageJson?: boolean
}
