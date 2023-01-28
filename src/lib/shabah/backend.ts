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

export const downloadIncidesUrl = (origin: string) => `${removeSlashAtEnd(origin)}/__download-indices__.json`

export const cargoIndicesUrl = (origin: string) => `${removeSlashAtEnd(origin)}/__cargo-indices__.json`

export type ResourceMeta = {
    bytes: number,
    mime: Mime,
    storageUrl: string
    status: number
    statusText: string
}

export type ResourceMap = Record<string, ResourceMeta>

export type DownloadIndex = {
    id: string
    map: ResourceMap
    title: string
    startedAt: number
    bytes: number
    version: string
    previousVersion: string
    resolvedUrl: string
}

export const operationCodes = {
    updatedExisting: 0,
    createdNew: 1,
    notFound: 2,
    removed: 3,
    saved: 4,
} as const

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
    const url = downloadIncidesUrl(origin)
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
    const existingIndex = indices.downloads.findIndex((download) => download.id === target.id)
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

export const removeDownloadIndex = (indices: DownloadIndexCollection, targetId: string) => {
    const targetIndex = indices.downloads.findIndex((download) => download.id === targetId)
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
    const url = downloadIncidesUrl(origin)
    await cache.putFile(url, new Response(text, {
        status: 200,
        statusText: "OK",
        headers: headers("application/json", stringBytes(text))
    }))
    return operationCodes.saved 
}

export type CargoState = (
    "updating" | "cached" | "archived" 
    | "update-failed" | "update-aborted"
)

export type Permissions = {key: string, value: string[]}[]

export type CargoIndex = {
    name: string
    id: string
    logoUrl: string
    resolvedUrl: string
    canonicalUrl: string
    bytes: number
    entry: string
    version: string
    permissions: Permissions
    state: CargoState
    createdAt: number
    updatedAt: number
}

export type CargoIndexWithoutMeta = Omit<CargoIndex, "updatedAt" | "createdAt">

export const emptyCargoIndices = () => ({
    cargos: [] as Array<CargoIndex>,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    savedAt: Date.now(),
    version: 1
})

export type CargoIndices = ReturnType<typeof emptyCargoIndices>

export const getCargoIndices = async (
    origin: string, 
    fileCache: FileCache
) => {
    const url = cargoIndicesUrl(origin)
    const cacheRes = await fileCache.getFile(url)
    if (!cacheRes || !cacheRes.ok) {
        return emptyCargoIndices()
    }
    try {
        return await cacheRes.json() as CargoIndices
    } catch {
        return emptyCargoIndices()
    }
}

export const updateCargoIndex = (
    indices: CargoIndices,
    target: CargoIndexWithoutMeta,
) => {
    const updatedAt = Date.now()
    indices.updatedAt = updatedAt
    const existingIndex = indices.cargos.findIndex((cargo) => cargo.id === target.id)
    if (existingIndex < 0) {
        indices.cargos.push({...target, updatedAt, createdAt: updatedAt})
        return operationCodes.createdNew
    }
    const previousIndex = indices.cargos[existingIndex]
    const updatedIndex = {
        ...previousIndex, ...target, updatedAt
    }
    indices.cargos[existingIndex] = updatedIndex
    return operationCodes.updatedExisting
}

export const stringBytes = (str: string) => (new TextEncoder().encode(str)).length

export const saveCargoIndices = async (
    indices: CargoIndices,
    origin: string,
    cache: FileCache
) => {
    indices.savedAt = Date.now()
    const text = JSON.stringify(indices)
    const url = cargoIndicesUrl(origin)
    await cache.putFile(url, new Response(text, {
        status: 200,
        statusText: "OK",
        headers: headers("application/json", stringBytes(text))
    }))
    return operationCodes.saved 
}
