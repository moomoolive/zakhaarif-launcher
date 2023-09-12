export type FileTransfer = {
    readonly type: string
    readonly length: string
    readonly body: ReadableStream<Uint8Array>
}

export type InitialExtensionState = {
    configuredPermissions: boolean
    queryState: string
    rootUrl: string
    recommendedStyleSheetUrl: string
} 


export type ReconfigurationConfig = {
    canonicalUrls: string[]
}

export type ManualSave = 1
export type AutoSave = 2
export type QuickSave = 3

export type SaveType = (
    ManualSave
    | AutoSave
    | QuickSave
)

export type SaveModMetadata = {
    canonicalUrl: string
    resolvedUrl: string
    entryUrl: string
    semver: string
}

export type SaveData = {
    id: number
    name: string
    type: SaveType
    mods: {
        canonicalUrls: string[]
        resolvedUrls: string[]
        entryUrls: string[]
        semvers: string[]
    }
} 

export type FatalErrorConfig = {
    details: string
}

export type ExtensionApis = Readonly<{
	signalFatalError: (config: FatalErrorConfig) => boolean
    readyForDisplay: () => boolean
    getSaveFile: (id: number) => Promise<SaveData | null>
    addToParentReplContext: (value: unknown) => boolean
    exitExtension: (config?: { force?: boolean }) => Promise<boolean>
}>

export type MainScriptConfig = Readonly<{
    rootElement: HTMLElement | null
    queryState: string
    rootUrl: string
    recommendedStyleSheetUrl: string
    entryUrl: string
    apis: ExtensionApis
}>

export type ExtensionModule = {
    main: (args: MainScriptConfig) => unknown
}

