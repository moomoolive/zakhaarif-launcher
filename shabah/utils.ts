import {io} from "../monads/result"
import {urlToMime, Mime} from "../miniMime/index"

export const fetchRetry = (
    input: RequestInfo | URL, 
    init: RequestInit & {retryCount: number}
) => {
    return io.retry(
        () => fetch(input, init), 
        init.retryCount
    )
}

export type FileRef = {
    name: string
    bytes: number
    requestUrl: string
    storageUrl: string
}

type OnAssetProgressParams = {
    downloaded: number, 
    total: number, 
    latestFile: string, 
    latestPartition: string,
    attemptCount: number
}

type CacheEngine = {
    put: (request: RequestInfo | URL, response: Response) => Promise<void>
}

const stripRelativePath = (url: string) => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else {
        return url
    }
}

const SHABAH_SOURCE = 1

const headers = (mimeType: Mime, contentLength: number) => {
    return {
        "Last-Modified": new Date().toUTCString(),
        "Sw-Source": SHABAH_SOURCE.toString(),
        "Content-Length": contentLength.toString(),
        "Content-Type": mimeType,
        "Sw-Cache-Hit": "1"
    } as const
}

type AssetListParams = {
    files: FileRef[],
    requestEngine: typeof fetchRetry,
    cacheEngine: CacheEngine
    name?: string,
    totalBytes?: number
    bytesCompleted?: number
    logger?: {
        warn: (...args: any) => void,
        info: (...args: any) => void,
    }
    onProgress?: (params: OnAssetProgressParams) => void,
    attemptCount?: number
    concurrent?: boolean
}

const persistAsset = async (
    file: Readonly<FileRef>, 
    params: Required<AssetListParams>
) => {
    const {
        onProgress,
        bytesCompleted,
        totalBytes,
        name: assetListName,
        attemptCount,
        requestEngine,
        logger,
        cacheEngine,
    } = params
    const {name, bytes, requestUrl, storageUrl} = file
    onProgress({
        downloaded: bytesCompleted,
        total: totalBytes,
        latestFile: stripRelativePath(name),
        latestPartition: assetListName,
        attemptCount: attemptCount
    })
    const fileRes = await requestEngine(requestUrl, {
        method: "GET",
        retryCount: 3
    })
    if (!fileRes.ok || !fileRes.data.ok) {
        logger.warn(`failed to fetch ${name} (partition=${assetListName})`)
        return fileRes
    }
    const extensionMime = urlToMime(requestUrl)
    const requestMime = fileRes.data.headers.get("content-type") as Mime | null
    const mimeType = extensionMime === ""
        ? requestMime || "text/plain"
        : extensionMime
    await cacheEngine.put(storageUrl, new Response(
        await fileRes.data.text(), 
        {
            status: 200,
            statusText: "OK",
            headers: headers(mimeType, bytes)
        }
    ))
    logger.info(`inserted file ${name} (partition=${assetListName}) into virtual drive (${storageUrl})`)
    return fileRes
}

export const persistAssetList = async (params: AssetListParams) => {
    const {
        files, 
        onProgress = () => {},
        bytesCompleted = 0,
        totalBytes = 0,
        name = "unspecified",
        attemptCount = 0,
        requestEngine,
        logger = {warn: () => {}, info: () => {}},
        cacheEngine,
        concurrent = false
    } = params
    let downloaded = bytesCompleted
    const failedRequests = [] as FileRef[]
    const persistParams = {
        files, requestEngine, logger, concurrent,
        bytesCompleted: downloaded, cacheEngine,
        name, totalBytes, onProgress, attemptCount
    } as Required<AssetListParams>
    const promises = []
    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const r = persistAsset(file, persistParams)
        if (concurrent) {
            promises.push(r)
            continue
        }
        const request = await r
        if (!request.ok || !request.data.ok) {
            failedRequests.push({...file})
            continue
        }
        persistParams.bytesCompleted + file.bytes
    }
    const fulfilledRequests = await Promise.all(promises)
    for (let i = 0; i < promises.length; i++) {
        const file = files[i]
        const request = fulfilledRequests[i]
        if (!request.ok || !request.data.ok) {
            failedRequests.push({...file})
        }
    }
    return {downloaded, failedRequests}
}
