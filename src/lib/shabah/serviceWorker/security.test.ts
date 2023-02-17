import {describe, it, expect} from "vitest"
import {
    makeBackgroundFetchHandler, ProgressUpdateRecord
} from "./backgroundFetchHandler"
import {
    emptyDownloadIndex,
    updateDownloadIndex,
    saveDownloadIndices,
    ResourceMap,
    NO_UPDATE_QUEUED,
    DownloadSegment,
    CACHED,
    UPDATING,
    ABORTED,
    FAILED,
    DownloadClientMessage,
    FileCache
} from "../backend"
import {urlToMime} from "../../miniMime/index"
import {
    BackgroundFetchUIEventCore,
    BackgroundFetchResult,
} from "../../types/serviceWorkers"
import {getErrorDownloadIndex} from "../backend"
import { nanoid } from "nanoid"

const createBgFetchEvent = ({
    id, 
    result = "success", 
    fetchResult = {},
    recordsAvailable = true
}: {
    id: string
    result?: BackgroundFetchResult
    fetchResult?: Record<string, Response>,
    recordsAvailable?: boolean
}) => {
    const output = {
        ui: {
            updateCalled: false,
            state: null as unknown
        },
        finishPromise: Promise.resolve(null as unknown)
    }
    const results = Object.keys(fetchResult).map(url => {
        return {
            request: new Request(url),
            responseReady: Promise.resolve(fetchResult[url])
        } as const
    })
    return {
        output,
        event: {
            waitUntil: async (p) => { output.finishPromise = p },
            registration: {
                id,
                uploaded: 0,
                uploadTotal: 0,
                downloaded: 0,
                downloadTotal: 0,
                result,
                failureReason: "",
                recordsAvailable,
                abort: async () => true,
                matchAll: async () => results,
                addEventListener: () => {},
                onprogress: () => {}
            },
            updateUI: async (input) => {
                if (output.ui.updateCalled) {
                    throw new Error("updateUI already called")
                }
                output.ui.updateCalled = true
                output.ui.state = input
            }
        } as BackgroundFetchUIEventCore
    }
}

const createDownloadIndex = ({
    id = "pkg", 
    title = "none", 
    name = "",
    bytes = 0, 
    canonicalUrl = "", 
    map = {}, 
    version = "0.1.0",
    resourcesToDelete = [],
    downloadedResources = [],
    canRevertToPreviousVersion = false,
    previousVersion = "none", 
    resolvedUrl = "",
    previousId = ""
} = {}) => {
    const putIndex = {
        id, 
        previousId,
        title, 
        bytes,
        segments: [{
            name,
            map, 
            canonicalUrl, 
            version, 
            previousVersion, 
            resolvedUrl,
            bytes,
            resourcesToDelete,
            downloadedResources,
            canRevertToPreviousVersion
        }]
    }
    return putIndex
}

type FileRecord = Record<string, Response>

const createCache = (files: FileRecord): FileCache => {
    return {
        getFile: async (url: string) => files[url],
        putFile: async (url: string, file: Response) => { 
            files[url] = file
            return true
        },
        queryUsage: async () => ({usage: 0, quota: 0}),
        deleteFile: async () => true,
        deleteAllFiles: async () => true,
        requestPersistence: async () => true,
        isPersisted: async () => true,
        listFiles: async () => [],
    }
}

const createBgFetchArgs = (
    initFiles: FileRecord
) => {
    const cache = createCache(initFiles)
    const clientMessages: DownloadClientMessage[] = []
    const innerVirtualCache = {} as FileRecord
    return {
        fileCache: cache, 
        internalRecord: initFiles,
        messageDownloadClient: async (message: DownloadClientMessage) => {
            clientMessages.push(message)
            return true
        },
        clientMessages,
        innerVirtualCache,
        virtualFileCache: createCache(innerVirtualCache)
    }
}

describe("virtual file system", () => {
    it("messages should be written to virtual file cache if specified", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
            {name: "index.js", status: 200, statusText: "OK", bytes: 0},
            {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
            {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
        ]
        const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain",
            status,
            statusText
        }) as const)
        
        const {
            fileCache, 
            messageDownloadClient,
            virtualFileCache
        } = createBgFetchArgs({})
        const canonicalUrl = remoteOrigin
        const downloadIndices = emptyDownloadIndex()
        const downloadId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl,
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = item
                return total
            }, {} as ResourceMap),
            bytes: 0
        }))
        await saveDownloadIndices(
            downloadIndices, 
            origin, 
            virtualFileCache
        )
        
        const {event} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "failure",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache, 
            messageDownloadClient,
            log: () => {},
            type: "fail",
            virtualFileCache
        })
        await handler(event)       
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            virtualFileCache
        )
        expect(errorIndex).not.toBe(null)
        const normalFileErrorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(normalFileErrorIndex).toBe(null)
    })
})