import type {Mime} from "../miniMime/index"
export {
    serviceWorkerCacheHitHeader,
    serviceWorkerErrorCatchHeader,
    serviceWorkerPolicies,
    serviceWorkerPolicyHeader,
    NETWORK_FIRST_POLICY,
    NETWORK_ONLY_POLICY,
    CACHE_FIRST_POLICY,
    CACHE_ONLY_POLICY
} from "./serviceWorkerMeta"
export type {ServiceWorkerPolicy} from "./serviceWorkerMeta"

export type FileCache = {
    getFile: (url: string) => Promise<Response | null>
    putFile: (url: string, file: Response) => Promise<boolean>
    deleteFile: (url: string) => Promise<boolean>
    listFiles: () => Promise<readonly Request[]>
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

export const downloadIndicesUrl = (origin: string) => `${removeSlashAtEnd(origin)}/__download-indices__.json`

export const cargoIndicesUrl = (origin: string) => `${removeSlashAtEnd(origin)}/__cargo-indices__.json`

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
    fileCache: FileCache
) => {
    const url = errDownloadIndexUrl(resolvedUrl)
    const file = await fileCache.getFile(url)
    if (!file) {
        return null
    }
    const index = await file.json() as DownloadIndex
    return {index, url}
}

export const saveErrorDownloadIndex = async (
    resolvedUrl: string,
    index: DownloadIndex,
    fileCache: FileCache
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
    await fileCache.putFile(url, response)
    return operationCodes.saved
}

export const emptyDownloadIndex = () => ({
    downloads: [] as Array<DownloadIndex>,
    totalBytes: 0,
    version: 1,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    savedAt: Date.now(),
})

export type DownloadIndexCollection = ReturnType<typeof emptyDownloadIndex>

export type FetchFunction = typeof fetch

export const getDownloadIndices = async (
    origin: string, 
    fileCache: FileCache
) => {
    const url = downloadIndicesUrl(origin)
    const cacheRes = await fileCache.getFile(url)
    if (!cacheRes || !cacheRes.ok) {
        return emptyDownloadIndex()
    }
    try {
        return await cacheRes.json() as DownloadIndexCollection
    } catch {
        return emptyDownloadIndex()
    }
}

export const updateDownloadIndex = (
    indices: DownloadIndexCollection,
    target: Omit<DownloadIndex, "startedAt">,
) => {
    const startedAt = Date.now()
    indices.updatedAt = startedAt
    const existingIndex = indices.downloads.findIndex(
        (download) => download.id === target.id
    )
    if (existingIndex < 0) {
        indices.downloads.push({...target, startedAt})
        indices.totalBytes += target.bytes
        return operationCodes.createdNew
    }
    const previousIndex = indices.downloads[existingIndex]
    const prevBytes = previousIndex.bytes
    const currentBytes = target.bytes
    indices.totalBytes += (currentBytes - prevBytes)
    const updateIndex = {
        ...previousIndex, ...target, startedAt
    }
    indices.downloads[existingIndex] = updateIndex
    return operationCodes.updatedExisting
}

export const removeDownloadIndex = (
    indices: DownloadIndexCollection, 
    id: string
) => {
    const targetIndex = indices.downloads.findIndex(
        (download) => download.id === id
    )
    if (targetIndex < 0) {
        return  operationCodes.notFound
    }
    const target = indices.downloads[targetIndex]
    indices.totalBytes -= target.bytes
    indices.downloads.splice(targetIndex, 1)
    return operationCodes.removed
}

export const saveDownloadIndices = async (
    indices: DownloadIndexCollection,
    origin: string,
    cache: FileCache
) => {
    indices.savedAt = Date.now()
    const text = JSON.stringify(indices)
    const url = downloadIndicesUrl(origin)
    await cache.putFile(url, new Response(text, {
        status: 200,
        statusText: "OK",
        headers: headers("application/json", stringBytes(text))
    }))
    return operationCodes.saved 
}

export const CACHED = 1
export const UPDATING = 2
export const FAILED = 3
export const ABORTED = 4

export type CargoState = (
    typeof CACHED 
    | typeof UPDATING
    | typeof FAILED 
    | typeof ABORTED
)

export type DownloadClientMessage = {
    timestamp: number
    downloadId: string
    stateUpdates: Array<{
        canonicalUrl: string
        state: CargoState
    }>
}

export type DownloadClientMessageConsumer = {
    getAllMessages: () => Promise<ReadonlyArray<DownloadClientMessage>>,
    deleteMessage: (message: DownloadClientMessage) => Promise<boolean> 
    deleteAllMessages: () => Promise<boolean>
}

export const downloadClientMessageUrl = (message: DownloadClientMessage): string => {
    return `https://sw.queue/${message.downloadId}`
}

export type DownloadClientCargoIndexStorage = {
    getIndex: (canonicalUrl: string) => Promise<CargoIndex | null>
    putIndex: (index: CargoIndex) => Promise<boolean>
    deleteIndex: (canonicalUrl: string) => Promise<boolean>
}

export type Permissions = {key: string, value: string[]}[]

export type CargoIndex = {
    name: string
    tag: number
    logo: string
    resolvedUrl: string
    canonicalUrl: string
    bytes: number
    entry: string
    version: string
    permissions: Permissions
    state: CargoState
    downloadId: string
    created: number
    updated: number
}

export type CargoIndexWithoutMeta = Omit<CargoIndex, "updated" | "created">

export const stringBytes = (str: string) => (new TextEncoder().encode(str)).length

export const NO_UPDATE_QUEUED = ""
