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
    DownloadClientMessage
} from "../backend"
import {urlToMime} from "../../miniMime/index"
import {
    BackgroundFetchUIEventCore,
    BackgroundFetchResult,
} from "../../types/serviceWorkers"
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

const createBgFetchArgs = (initFiles: Record<string, Response>) => {
    const cache = {
        getFile: async (url: string) => initFiles[url],
        putFile: async (url: string, file: Response) => { 
            initFiles[url] = file
            return true
        },
        queryUsage: async () => ({usage: 0, quota: 0}),
        deleteFile: async () => true,
        deleteAllFiles: async () => true,
        requestPersistence: async () => true,
        isPersisted: async () => true,
        listFiles: async () => [],
    }
    const clientMessages: DownloadClientMessage[] = []
    return {
        fileCache: cache, 
        internalRecord: initFiles,
        messageDownloadClient: async (message: DownloadClientMessage) => {
            clientMessages.push(message)
            return true
        },
        clientMessages
    }
}

describe("background fetch success handler", () => {
    it("successful fetches should not cache responses not found in download index map", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const {
            fileCache, 
            internalRecord, 
            messageDownloadClient,
            clientMessages
        } = createBgFetchArgs({})
        const downloadIndices = emptyDownloadIndex()
        const canonicalUrl = remoteOrigin
        const downloadId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl,
            map: {},
            bytes: 0
        }))
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache,
            messageDownloadClient,
            log: () => {},
            type: "success"
        })
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: {
                [remoteOrigin + "/pkg/cargo.json"]: new Response("", {
                    status: 200,
                }),
                [remoteOrigin + "/pkg/another.json"]: new Response("", {
                    status: 200,
                }),
            }
        })
        await handler(event)
        expect(
            Object.keys(internalRecord).length - prevFilecount
        ).toBe(0)
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        expect(clientMessages.length).toBe(1)
        expect(clientMessages[0].stateUpdates.length).toBe(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: CACHED
        })
    })

    it("successful fetches should cache all assets found in download-index map into file cache", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            "cargo.json",
            "index.js",
            "perf.wasm",
            "icon.png",
        ]
        const cacheFileMeta = cacheFiles.map((name) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain"
        }) as const)
        const canonicalUrl = remoteOrigin
        const {
            fileCache, 
            internalRecord, 
            messageDownloadClient,
            clientMessages
        } = createBgFetchArgs({})
        const downloadIndices = emptyDownloadIndex()
        const downloadId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = {
                    bytes: 0,
                    storageUrl: item.storageUrl,
                    mime: item.mime,
                    status: 200,
                    statusText: ""
                }
                return total
            }, {} as ResourceMap),
            bytes: 0
        }))
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache, 
            log: () => {},
            type: "success",
            messageDownloadClient,
        })
        await handler(event)
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + cacheFileMeta.length
        )
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        expect(clientMessages.length).toBe(1)
        expect(clientMessages[0].stateUpdates.length).toBe(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: CACHED
        })
    })

    it(`successful fetches should set associated cargo indexes 'downloadId' to '${NO_UPDATE_QUEUED}' (no update queued)`, async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            "cargo.json",
            "index.js",
            "perf.wasm",
            "icon.png",
        ]
        const cacheFileMeta = cacheFiles.map((name) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain"
        }) as const)
        const cargoId = 0
        const canonicalUrl = remoteOrigin
        const {
            fileCache, internalRecord, messageDownloadClient,
            clientMessages
        } = createBgFetchArgs({})
        const downloadIndices = emptyDownloadIndex()
        const downloadId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = {
                    bytes: 0,
                    storageUrl: item.storageUrl,
                    mime: item.mime,
                    status: 200,
                    statusText: ""
                }
                return total
            }, {} as ResourceMap),
            bytes: 0
        }))
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache, 
            log: () => {},
            type: "success",
            messageDownloadClient
        })
        await handler(event)
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + cacheFileMeta.length
        )
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        expect(clientMessages.length).toBe(1)
        expect(clientMessages[0].stateUpdates.length).toBe(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: CACHED
        })
    })

    it(`can update multiple cargos simeltaneously within same bg-fetch`, async () => {
        const mainOrigin = "https://cool-vegtables.com"
        const testCases = [
            [
                {
                    origin: "https://cool-potatoes.com/",
                    files: [
                        "cargo.json",
                        "index.js",
                        "perf.wasm",
                        "icon.png",
                    ]
                },
                {
                    origin: "https://cool-eggplants.com/",
                    files: [
                        "cargo.json",
                        "entry.js",
                        "cool.png",
                        "hi.jpeg",
                    ]
                },
                {
                    origin: "https://cool-pumpkin.com/",
                    files: [
                        "cargo.json",
                        "index.html",
                        "cool.png",
                        "config.json",
                    ]
                },
            ],
            [
                {
                    origin: "https://hi.org/",
                    files: [
                        "cargo.json",
                        "index.js",
                    ]
                },
                {
                    origin: "https://cool-eggplants.com/",
                    files: [
                        "cargo.json",
                        "coool-entry.mjs",
                        "terrain.png",
                        "my-house.jpeg",
                    ]
                },
            ]
        ]
        for (const testCase of testCases) {
            const {
                fileCache, 
                internalRecord, 
                messageDownloadClient,
                clientMessages
            } = createBgFetchArgs({})
            const downloadId = nanoid(21)
            const queuedDownload = {
                id: downloadId, 
                previousId: "",
                title: "random-update" + Math.random(), 
                bytes: 0,
                segments: [] as DownloadSegment[]
            }
            const downloadIndices = emptyDownloadIndex()
            const allFileCacheMeta = []
            for (const {origin, files} of testCase) {
                const canonicalUrl = origin
                const resolvedUrl = canonicalUrl
                const cacheFileMeta = files.map((name) => ({
                    storageUrl: resolvedUrl + name,
                    bytes: 0,
                    requestUrl: resolvedUrl + name,
                    mime: urlToMime(name) || "text/plain"
                }) as const)
                allFileCacheMeta.push(...cacheFileMeta)
                const cargoId = Math.trunc(Math.random() * 1_000)
                const resourceMap = cacheFileMeta.reduce((total, item) => {
                    const {requestUrl} = item
                    total[requestUrl] = {
                        bytes: 0,
                        storageUrl: item.storageUrl,
                        mime: item.mime,
                        status: 200,
                        statusText: ""
                    }
                    return total
                }, {} as ResourceMap)
                queuedDownload.segments.push({
                    name: "",
                    version: "0.1.0",
                    previousVersion: "none",
                    resolvedUrl: "",
                    canonicalUrl,
                    map: resourceMap,
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
                })
            }
            updateDownloadIndex(
                downloadIndices, 
                queuedDownload
            )
            await saveDownloadIndices(
                downloadIndices, 
                mainOrigin, 
                fileCache
            )

            const prevFilecount = Object.keys(internalRecord).length
            
            const fetchResult = allFileCacheMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", {status: 200}
                )
                return total
            }, {} as Record<string, Response>)

            const {event, output} = createBgFetchEvent({
                id: downloadId, 
                recordsAvailable: true,
                result: "success",
                fetchResult 
            })
            const handler = makeBackgroundFetchHandler({
                origin: mainOrigin, 
                fileCache, 
                messageDownloadClient,
                log: () => {},
                type: "success"
            })
            await handler(event)
            expect(Object.keys(internalRecord).length).toBe(
                prevFilecount + allFileCacheMeta.length
            )
            expect(output.ui.updateCalled).toBe(true)
            expect(!!output.ui.state).toBe(true)
            expect(clientMessages.length).toBe(1)
            expect(clientMessages[0].stateUpdates.length).toBe(testCase.length)

            for (const {origin} of testCase) {
                const stateUpdate = clientMessages[0].stateUpdates.find(
                    (update) => update.canonicalUrl === origin
                )
                expect(stateUpdate).not.toBe(undefined)
                expect(stateUpdate).toStrictEqual({
                    canonicalUrl: origin,
                    state: CACHED
                })
            }
        }
    })

    it(`successful background fetches should call progress handler twice`, async () => {
        const origin = "https://cool-potatos.com"
        const canonicalUrl = origin + "/"
        const resolvedUrl = canonicalUrl
        const cacheFiles = [
            "cargo.json",
            "index.js",
            "perf.wasm",
            "icon.png",
        ]
        const cacheFileMeta = cacheFiles.map((name) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: resolvedUrl + name,
            mime: urlToMime(name) || "text/plain"
        }) as const)

        const {
            fileCache, internalRecord, messageDownloadClient,
            clientMessages
        } = createBgFetchArgs({})
        const downloadIndices = emptyDownloadIndex()
        const downloadId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = {
                    bytes: 0,
                    storageUrl: item.storageUrl,
                    mime: item.mime,
                    status: 200,
                    statusText: ""
                }
                return total
            }, {} as ResourceMap),
            bytes: 0
        }))
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoId = 0
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const progressEvents: ProgressUpdateRecord[] = []
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache,
            messageDownloadClient,
            log: () => {},
            type: "success",
            onProgress: (update) => progressEvents.push(update)
        })
        await handler(event)
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + cacheFileMeta.length
        )
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        expect(progressEvents.length).toBe(2)
        expect(progressEvents[0]).toStrictEqual({
            type: "install",
            downloadId: downloadId,
            canonicalUrls: [canonicalUrl]
        })
        expect(progressEvents[1]).toStrictEqual({
            type: "success",
            downloadId: downloadId,
            canonicalUrls: [canonicalUrl]
        })
        expect(clientMessages.length).toBe(1)
        expect(clientMessages[0].stateUpdates).length(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: CACHED
        })
    })
})
