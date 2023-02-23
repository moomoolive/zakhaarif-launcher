import type {Mime} from "../miniMime/index"

export type FileCache = {
    getFile: (url: string) => Promise<Response | null>
    listFiles: () => Promise<readonly Request[]>
    
    putFile: (url: string, file: Response) => Promise<boolean>
    
    deleteFile: (url: string) => Promise<boolean>
    deleteAllFiles: () => Promise<boolean>

    queryUsage: () => Promise<{quota: number, usage: number}>
    
    requestPersistence: () => Promise<boolean>
    isPersisted: () => Promise<boolean>
}

export const rootDocumentFallBackUrl = (origin: string) => `${removeSlashAtEnd(origin)}/offline.html`

export const headers = (mimeType: Mime, contentLength: number) => ({
    "Last-Modified": new Date().toUTCString(),
    "Sw-Source": "shabah",
    "Content-Length": contentLength.toString(),
    "Content-Type": mimeType
} as const)

export type DownloadState = {
    id: string
    downloaded: number
    total: number
    failed: boolean
    finished: boolean
    failureReason: string
}

export type DownloadManager = {
    queueDownload: (
        id: string, 
        urls: string[], 
        options: {downloadTotal: number, title?: string}
    ) => Promise<boolean>,
    getDownloadState: (id: string) => Promise<DownloadState | null>
    cancelDownload: (id: string) => Promise<boolean>
    currentDownloadIds: () => Promise<string[]>
}

export const removeSlashAtEnd = (str: string) => str.endsWith("/") ? str.slice(0, -1) : str

export type ResourceMeta = {
    bytes: number,
    mime: Mime,
    storageUrl: string
    status: number
    statusText: string
}

export type ResourceMap = Record<string, ResourceMeta>

export type DownloadSegment = {
    map: ResourceMap
    bytes: number
    name: string
    version: string
    previousVersion: string
    downloadedResources: string[]
    canRevertToPreviousVersion: boolean
    resourcesToDelete: string[]
    canonicalUrl: string
    resolvedUrl: string
}

export type DownloadIndex = {
    id: string
    previousId: string
    segments: DownloadSegment[]
    title: string
    startedAt: number
    bytes: number
}

export const operationCodes = {
    updatedExisting: 0,
    createdNew: 1,
    notFound: 2,
    removed: 3,
    saved: 4,
    tooManySegments: 5,
    noSegmentsFound: 6
} as const

export type BackendOpertionCode = typeof operationCodes[keyof typeof operationCodes]

const errDownloadIndexUrl = (resolvedUrl: string) => `${removeSlashAtEnd(resolvedUrl)}/__err-download-index__.json`

const isRelativeUrl = (url: string) => !url.startsWith("http://") && !url.startsWith("https://")

export const getErrorDownloadIndex = async (
    resolvedUrl: string,
    virtualFileCache: FileCache
) => {
    const url = errDownloadIndexUrl(resolvedUrl)
    const file = await virtualFileCache.getFile(url)
    if (!file) {
        return null
    }
    const index = await file.json() as DownloadIndex
    return {index, url}
}

export const saveErrorDownloadIndex = async (
    resolvedUrl: string,
    index: DownloadIndex,
    virtualFileCache: FileCache
) => {
    if (isRelativeUrl(resolvedUrl)) {
        throw new Error("error download indices storage url must be a full url and not a relative one. Got " + resolvedUrl)
    }
    if (index.segments.length > 1) {
        return operationCodes.tooManySegments
    }
    if (index.segments.length < 1) {
        return operationCodes.noSegmentsFound
    }
    const url = errDownloadIndexUrl(resolvedUrl)
    const text = JSON.stringify(index)
    const response = new Response(text, {status: 200, statusText: "OK"})
    await virtualFileCache.putFile(url, response)
    return operationCodes.saved
}

export type FetchFunction = typeof fetch

export const CACHED = 1
export const UPDATING = 2
export const FAILED = 3
export const ABORTED = 4

export type ManifestState = (
    typeof CACHED 
    | typeof UPDATING
    | typeof FAILED 
    | typeof ABORTED
)

export type DownloadClientMessage = {
    id: string
    timestamp: number
    downloadId: string
    stateUpdates: Array<{
        canonicalUrl: string
        state: ManifestState
    }>
}

export type UniqueMessage = { id: string } 

export type ThreadSafeMessageChannel<Message extends UniqueMessage> = {
    createMessage: (message: Message) => Promise<boolean>
    
    getAllMessages: () => Promise<ReadonlyArray<Message>>,
    getMessage: (id: string) => Promise<Message | null>
    
    deleteMessage: (id: string) => Promise<boolean> 
    deleteAllMessages: () => Promise<boolean>
}

export type ClientMessageChannel = ThreadSafeMessageChannel<DownloadClientMessage>

export type BackendMessageChannel = ThreadSafeMessageChannel<DownloadIndex>

export type DownloadClientManifestIndexStorage = {
    getIndex: (canonicalUrl: string) => Promise<ManifestIndex | null>
    putIndex: (index: ManifestIndex) => Promise<boolean>
    deleteIndex: (canonicalUrl: string) => Promise<boolean>
}

export type Permissions = {key: string, value: string[]}[]

export type ManifestIndex = {
    name: string
    tag: number
    logo: string
    resolvedUrl: string
    canonicalUrl: string
    manifestName: string
    bytes: number
    entry: string
    version: string
    permissions: Permissions
    state: ManifestState
    downloadId: string
    created: number
    updated: number
}

export type ManifestIndexWithoutMeta = Omit<ManifestIndex, "updated" | "created">

export const NO_UPDATE_QUEUED = ""
