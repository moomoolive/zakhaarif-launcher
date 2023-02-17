import {Shabah} from "../downloadClient"
import {CACHED, CargoIndex, CargoState, DownloadClientCargoIndexStorage, DownloadClientMessage, DownloadClientMessageConsumer, FileCache, NO_UPDATE_QUEUED, UPDATING} from "../backend"
import {DownloadManager} from "../backend"
import { cleanPermissions } from "../../utils/security/permissionsSummary"
import {UpdateCheckConfig, UpdateCheckResponse} from "../updateCheckStatus"
import { Cargo } from "../../cargo"
import { Permissions } from "../../types/permissions"

const addUrlToResponse = (response: Response, url: string) => {
    Object.defineProperty(response, "url", {value: url})
    return response
}

type FileHandlers = Record<string, () => (Response | null)>
type AccessLog = Readonly<{
    url: string
    time: number
    action: "get" | "put" | "delete"
}>

class MockCache {
    private cache = {} as FileHandlers
    readonly accessLog = [] as Array<AccessLog>

    constructor(initCache?: FileHandlers) {
        this.cache = initCache || {}
        this.accessLog = []
    }

    getFile(url: string) {
        this.accessLog.push({url, action: "get", time: Date.now()})
        const fileHandler = this.cache[url]
        if (!fileHandler) {
            return
        }
        const file = fileHandler()
        if (!file) {
            return
        }
        return addUrlToResponse(file.clone(), url)
    }

    putFile(url: string, response: Response) {
        this.accessLog.push({url, action: "put", time: Date.now()})
        this.cache[url] = () => response
    }

    deleteFile(url: string) {
        this.accessLog.push({url, action: "delete", time: Date.now()})
        this.cache[url] = () => null
    }

    deleteAll() {
        this.cache = {}
    }
}

const createCache = (
    cacheFiles: FileHandlers,
    cacheQuota: {usage: number, quota: number}
) => {
    const innerFileCache = new MockCache(cacheFiles)
    const fileCache: FileCache = {
        getFile: async (url) => {
            return innerFileCache.getFile(url) || null
        },
        putFile: async (url, response) => {
            innerFileCache.putFile(url, response)
            return true
        },
        queryUsage: async () => cacheQuota,
        deleteFile: async (url) => {
            innerFileCache.deleteFile(url)
            return true
        },
        deleteAllFiles: async () => {
            innerFileCache.deleteAll()
            return true
        },
        listFiles: async () => [],
        isPersisted: async () => true,
        requestPersistence: async () => true
    }
    return [innerFileCache, fileCache] as const
}

const dependencies = ({
    cacheFiles = {} as FileHandlers,
    cacheQuota = {usage: 0, quota: 0},
    networkFiles = {} as FileHandlers,
    createVirtualCache = false
} = {}) => {
    
    const networkCache = new MockCache(networkFiles)
    const networkRequest: typeof fetch = async (input) => {
        const url = ((i: typeof input) => {
            return i instanceof URL 
                ? i.href
                : i instanceof Request ? i.url : i
        })(input)
        const response = networkCache.getFile(url)
        if (!response) {
            return addUrlToResponse(
                new Response("", {status: 404}),
                url
            )
        }
        const isRedirectStatus = (
            response.status > 299 
            && response.status < 400
        )
        const hasRedirectHeader = response.headers.has("location")
        if (!isRedirectStatus || !hasRedirectHeader) {
            return response
        }
        const redirectUrl = response.headers.get("location") || ""
        const redirectResponse = networkCache.getFile(redirectUrl)
        if (!redirectResponse) {
            return addUrlToResponse(
                new Response("", {status: 404}),
                redirectUrl
            )
        }
        return redirectResponse
    }

    const [innerFileCache, fileCache] = createCache(cacheFiles, cacheQuota)
    /*
    const innerFileCache = new MockCache(cacheFiles)
    const fileCache: FileCache = {
        getFile: async (url) => {
            return innerFileCache.getFile(url) || null
        },
        putFile: async (url, response) => {
            innerFileCache.putFile(url, response)
            return true
        },
        queryUsage: async () => cacheQuota,
        deleteFile: async (url) => {
            innerFileCache.deleteFile(url)
            return true
        },
        deleteAllFiles: async () => {
            innerFileCache.deleteAll()
            return true
        },
        listFiles: async () => [],
        isPersisted: async () => true,
        requestPersistence: async () => true
    }
    */

    const downloadState = {
        queuedDownloads: [] as Array<{
            id: string, urls: 
            string[], 
            options: {
                title: string
                downloadTotal: number
            }
        }>
    }

    const canceledDownloads = new Map<string, 1>()
    const queuedDownloads = new Map<string, number>()
    const downloadManager: DownloadManager = {
        queueDownload: async (id, urls, {title = "", downloadTotal}) => {
            queuedDownloads.set(id, 1)
            downloadState.queuedDownloads.push({
                id,
                urls,
                options: {title, downloadTotal}
            })
            return true
        },
        getDownloadState: async (id) => {
            const exists = queuedDownloads.has(id)
            if (!exists) {
                return null
            }
            const queueIndex = downloadState.queuedDownloads.findIndex(
                (download) => download.id === id
            )
            return {
                id,
                downloaded: 0,
                total: queueIndex < 0
                    ? 100
                    : downloadState.queuedDownloads[queueIndex].options.downloadTotal,
                failed: false,
                finished: false,
                failureReason: "none"
            }
        },
        cancelDownload: async (id) => {
            canceledDownloads.set(id, 1)
            return true
        },
        currentDownloadIds: async () => {
            return downloadState.queuedDownloads.map(
                (download) => download.id
            )
        }
    }

    let clientMessages: Record<string, DownloadClientMessage> = {}

    const messageConsumer: DownloadClientMessageConsumer = {
        getAllMessages: async () => Object.values(clientMessages),
        deleteMessage: async (targetMessage) => {
            if (!(targetMessage.downloadId in clientMessages)) {
                return false
            }
            delete clientMessages[targetMessage.downloadId]
            return true
        },
        deleteAllMessages: async () => {
            clientMessages = {}
            return true
        }
    }

    const store: Record<string, CargoIndex> = {}

    const indexStorage: DownloadClientCargoIndexStorage = {
        getIndex: async (canonicalUrl) => {
            if (!(canonicalUrl in store)) {
                return null
            }
            return store[canonicalUrl]
        },
        putIndex: async (index) => {
            store[index.canonicalUrl] = index
            return true
        },
        deleteIndex: async (canonicalUrl) => {
            delete store[canonicalUrl]
            return true
        }
    }

    const [innerVirtualCache, virtualFileCache] = createCache({}, cacheQuota) 

    return {
        adaptors: {networkRequest, fileCache, downloadManager},
        caches: {networkCache, innerFileCache, innerVirtualCache},
        downloadState,
        internalCargoStore: store,
        canceledDownloads,
        messageConsumer,
        clientMessages,
        indexStorage,
        virtualFileCache
    }
}

export const createClient = (
    origin: string, 
    config?: Parameters<typeof dependencies>[0]
) => {
    const deps = dependencies(config)
    const {
        adaptors, 
        messageConsumer, 
        indexStorage,
        virtualFileCache
    } = deps
    return {
        ...deps, 
        client: new Shabah({
            origin,
            adaptors, 
            permissionsCleaner: cleanPermissions,
            messageConsumer,
            indexStorage,
            ...(config?.createVirtualCache ? {virtualFileCache} : {})
        })
    }
}

export const createUpdateCheck = (config: Partial<UpdateCheckConfig>) => {
    const {
        status = Shabah.STATUS.ok,
        tag = 0,
        originalResolvedUrl = "",
        canonicalUrl = "",
        resolvedUrl = "",
        errors = [],
        newCargo = null,
        originalNewCargoResponse = new Response(),
        previousCargo = null,
        
        downloadableResources = [],
        resourcesToDelete = [],

        diskInfo = {used: 0, total: 0, left: 0},
    } = config
    return new UpdateCheckResponse({
        diskInfo,
        downloadableResources,
        resourcesToDelete,
        previousCargo,
        newCargo,
        originalNewCargoResponse,
        errors,
        tag,
        originalResolvedUrl,
        resolvedUrl,
        canonicalUrl,
        status,
    })
}

export const cargoToCargoIndex = (
    canonicalUrl: string,
    cargo: Cargo<Permissions>, 
    {
        tag = 0,
        resolvedUrl,
        bytes = 0,
        state = CACHED,
        downloadId = NO_UPDATE_QUEUED
    }: Partial<{
        tag: number
        resolvedUrl: string
        bytes: number
        state: CargoState,
        downloadId: string
    }> = {}
) => {
    const index: CargoIndex = {
        tag,
        name: cargo.name,
        logo: cargo.crateLogoUrl,
        resolvedUrl: resolvedUrl || canonicalUrl,
        canonicalUrl,
        bytes,
        entry: cargo.entry,
        version: cargo.version,
        permissions: cargo.permissions,
        state,
        created: Date.now(),
        updated: Date.now(),
        downloadId: downloadId
    }
    return index
}