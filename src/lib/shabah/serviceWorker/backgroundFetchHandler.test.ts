import {describe, it, expect} from "vitest"
import {
    makeBackgroundFetchHandler, ProgressUpdateRecord
} from "./backgroundFetchHandler"
import {
    emptyDownloadIndex,
    updateDownloadIndex,
    saveDownloadIndices,
    emptyCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    ResourceMap,
    getCargoIndices,
    NO_UPDATE_QUEUED,
    DownloadSegment
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
    bytes = 0, 
    canonicalUrl = "", 
    map = {}, 
    version = "0.1.0",
    resourcesToDelete = [],
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
            map, 
            canonicalUrl, 
            version, 
            previousVersion, 
            resolvedUrl,
            bytes,
            resourcesToDelete
        }]
    }
    return putIndex
}

const createFileCache = (initFiles: Record<string, Response>) => {
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
    return {fileCache: cache, internalRecord: initFiles}
}

describe("background fetch success handler", () => {
    const makeBgFetchHandle = makeBackgroundFetchHandler

    it("cache should not be changed if download indices doesn't exist", async () => {
        const origin = "https://cool-potatos.com"
        const cargoId = "pkg"
        const cargoIndices = emptyCargoIndices()
        const downloadQueueId = nanoid(21)
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: origin + "/pkg-store",
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl: "https://remote-origin.site/pkg",
            version: "0.1.0",
            state: "cached",
            downloadQueueId,
        })
        const {fileCache, internalRecord} = createFileCache({})
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const handler = makeBgFetchHandle({
            origin, 
            fileCache, 
            log: () => {},
            type: "success"
        })
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId
        })
        await handler(event)
        expect(Object.keys(internalRecord).length - prevFilecount).toBe(0)
        expect(output.ui.updateCalled).toBe(false)
    })

    it("successful fetches should not cache responses not found in download index map", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const canonicalUrl = remoteOrigin
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl,
            map: {},
            bytes: 0
        }))
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: "tmp",
            resolvedUrl: origin + "/pkg-store",
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const handler = makeBgFetchHandle({
            origin, 
            fileCache, 
            log: () => {},
            type: "success"
        })
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
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
        expect(
            (await getCargoIndices(origin, fileCache))
                .cargos
                .find((cargo) => cargo.canonicalUrl === canonicalUrl)?.state
        ).toBe("cached")
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
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
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
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: "",
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBgFetchHandle({
            origin, 
            fileCache, 
            log: () => {},
            type: "success"
        })
        await handler(event)
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + cacheFileMeta.length
        )
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        expect(
            (await getCargoIndices(origin, fileCache)).cargos.find(
                (cargo) => cargo.canonicalUrl === canonicalUrl
            )?.state
        ).toBe("cached")
    })

    it(`successful fetches should set associated cargo indexes 'downloadQueueId' to '${NO_UPDATE_QUEUED}' (no update queued)`, async () => {
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
        const cargoId = "pkg"
        const canonicalUrl = remoteOrigin
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
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
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBgFetchHandle({
            origin, 
            fileCache, 
            log: () => {},
            type: "success"
        })
        await handler(event)
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + cacheFileMeta.length
        )
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        const indexes = await getCargoIndices(origin, fileCache)
        const targetCargo = indexes.cargos.find(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        expect(!!targetCargo).toBe(true)
        expect(targetCargo?.state).toBe("cached")
        expect(targetCargo?.downloadQueueId).toBe(NO_UPDATE_QUEUED)
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
            const {fileCache, internalRecord} = createFileCache({})
            const downloadQueueId = nanoid(21)
            const queuedDownload = {
                id: downloadQueueId, 
                previousId: "",
                title: "random-update" + Math.random(), 
                bytes: 0,
                segments: [] as DownloadSegment[]
            }
            const downloadIndices = emptyDownloadIndex()
            const cargoIndices = emptyCargoIndices()
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
                const cargoId = "pkg-" + Math.trunc(Math.random() * 1_000)
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
                    version: "0.1.0",
                    previousVersion: "none",
                    resolvedUrl: "",
                    canonicalUrl,
                    map: resourceMap,
                    bytes: 0,
                    resourcesToDelete: []
                })
                updateCargoIndex(cargoIndices, {
                    tag: cargoId,
                    resolvedUrl: resolvedUrl,
                    entry: "index.js",
                    logoUrl: "",
                    permissions: [],
                    storageBytes: 0,
                    name: "pkg-name",
                    bytes: 20,
                    canonicalUrl,
                    version: "0.1.0",
                    state: "updating",
                    downloadQueueId
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
            await saveCargoIndices(
                cargoIndices, 
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
                id: downloadQueueId, 
                recordsAvailable: true,
                result: "success",
                fetchResult 
            })
            const handler = makeBgFetchHandle({
                origin: mainOrigin, 
                fileCache, 
                log: () => {},
                type: "success"
            })
            await handler(event)
            expect(Object.keys(internalRecord).length).toBe(
                prevFilecount + allFileCacheMeta.length
            )
            expect(output.ui.updateCalled).toBe(true)
            expect(!!output.ui.state).toBe(true)
            const indexesAfterUpdate = await getCargoIndices(mainOrigin, fileCache)
            
            for (const {origin} of testCase) {
                const targetCargo = indexesAfterUpdate.cargos.find(
                    (cargo) => cargo.canonicalUrl === origin
                )
                expect(!!targetCargo).toBe(true)
                expect(targetCargo?.state).toBe("cached")
                expect(targetCargo?.downloadQueueId).toBe(NO_UPDATE_QUEUED)
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

        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
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
        const cargoIndices = emptyCargoIndices()
        const cargoId = "pkg"
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const progressEvents: ProgressUpdateRecord[] = []
        const handler = makeBgFetchHandle({
            origin, 
            fileCache, 
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
        const indexes = await getCargoIndices(origin, fileCache)
        const targetCargo = indexes.cargos.find(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        expect(!!targetCargo).toBe(true)
        expect(targetCargo?.state).toBe("cached")
        expect(targetCargo?.downloadQueueId).toBe(NO_UPDATE_QUEUED)
        expect(progressEvents.length).toBe(2)
        expect(progressEvents[0]).toStrictEqual({
            type: "install",
            downloadId: downloadQueueId,
            canonicalUrls: [canonicalUrl]
        })
        expect(progressEvents[1]).toStrictEqual({
            type: "success",
            downloadId: downloadQueueId,
            canonicalUrls: [canonicalUrl]
        })
    })
})

describe("background fetch fail handler (abort/fail)", () => {
    it("failed handler should save successfully fetches to cache, and create a record of failed fetches", async () => {
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
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const canonicalUrl = remoteOrigin
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
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
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
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
            log: () => {},
            type: "fail"
        })
        await handler(event)
        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        const errorLogFile = 1
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + finishedRequests.length + errorLogFile
        )
        expect(
            (await getCargoIndices(origin, fileCache))
                .cargos
                .find((cargo) => cargo.canonicalUrl === canonicalUrl)?.state
        ).toBe("update-failed")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it("failed handler should call update ui function", async () => {
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
        const canonicalUrl = remoteOrigin
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
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
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId: downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
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
            log: () => {},
            type: "fail"
        })
        await handler(event)
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)

        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        const errorLogFile = 1
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + finishedRequests.length + errorLogFile
        )
        expect(
            (await getCargoIndices(origin, fileCache))
                .cargos
                .find((cargo) => cargo.canonicalUrl === canonicalUrl)?.state
        ).toBe("update-failed")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it(`failed handler should set cargo indexes download id to "${NO_UPDATE_QUEUED}" (no update queued)`, async () => {
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
        const canonicalUrl = remoteOrigin
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
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
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId: downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadQueueId, 
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
            log: () => {},
            type: "fail"
        })
        await handler(event)
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)

        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        const errorLogFile = 1
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + finishedRequests.length + errorLogFile
        )
        const indexesAfterUpdate = await getCargoIndices(origin, fileCache)
        const target = indexesAfterUpdate.cargos.find(
            (cargo) => cargo.canonicalUrl === canonicalUrl 
        )
        expect(!!target).toBe(true)
        expect(target?.downloadQueueId).toBe(NO_UPDATE_QUEUED)
        expect(target?.state).toBe("update-failed")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it(`if multiple segments are being downloaded together and operation fails, error logs should be only be created for segments that failed`, async () => {
        const mainOrigin = "https://green-corn.com"
        const testCases = [
            [
                {
                    origin: "https://cool-potatos.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "index.js", status: 200, statusText: "OK", bytes: 0},
                        {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
                        {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
                    ],
                },
                {
                    origin: "https://veggies.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "entry.js", status: 200, statusText: "OK", bytes: 0},
                    ],
                },
                {
                    origin: "https://corn-on-the-cob.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "pixie.png", status: 200, statusText: "OK", bytes: 0},
                        {name: "texture.png", status: 200, statusText: "OK", bytes: 0},
                    ],
                },
            ],
            [
                {
                    origin: "https://purple-radish.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "index.js", status: 200, statusText: "OK", bytes: 0},
                        {name: "perf.wasm", status: 200, statusText: "FORBIDDEN", bytes: 0},
                        {name: "icon.png", status: 200, statusText: "NOT FOUND", bytes: 0},
                    ],
                },
                {
                    origin: "https://cool-veggies.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "entry.js", status: 200, statusText: "OK", bytes: 0},
                        {name: "dynamic-link.js", status: 500, statusText: "OK", bytes: 0},
                    ],
                },
                {
                    origin: "https://hey.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "no.png", status: 200, statusText: "OK", bytes: 0},
                        {name: "texture.png", status: 403, statusText: "OK", bytes: 0},
                    ],
                },
            ]
        ]
        for (const testCase of testCases) {
            const {fileCache, internalRecord} = createFileCache({})
            const downloadIndices = emptyDownloadIndex()
            const cargoIndices = emptyCargoIndices()
            const downloadQueueId = nanoid(21)
            const queuedDownload = {
                id: downloadQueueId, 
                previousId: "",
                title: "random-update" + Math.random(), 
                bytes: 0,
                segments: [] as DownloadSegment[]
            }
            const allFileCacheMeta = []
            for (const {origin, files} of testCase) {
                const id = "pkg-" + Math.trunc(Math.random() * 1_000)
                const canonicalUrl = origin + "/"
                const resolvedUrl = canonicalUrl
                const cacheFiles = files
                const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
                    storageUrl: resolvedUrl + name,
                    bytes: 0,
                    requestUrl: resolvedUrl + name,
                    mime: urlToMime(name) || "text/plain",
                    status,
                    statusText
                }) as const)
                allFileCacheMeta.push(...cacheFileMeta)
                const resourceMap = cacheFileMeta.reduce((total, item) => {
                    const {requestUrl} = item
                    total[requestUrl] = item
                    return total
                }, {} as ResourceMap)
                queuedDownload.segments.push({
                    version: "0.1.0",
                    previousVersion: "none",
                    resolvedUrl,
                    canonicalUrl,
                    map: resourceMap,
                    bytes: 0,
                    resourcesToDelete: []
                })
                updateCargoIndex(cargoIndices, {
                    tag: id,
                    resolvedUrl: resolvedUrl,
                    entry: "index.js",
                    name: "pkg-name",
                    permissions: [],
                    storageBytes: 0,
                    logoUrl: "",
                    bytes: 20,
                    canonicalUrl,
                    version: "0.1.0",
                    state: "updating",
                    downloadQueueId: downloadQueueId
                })
            }

            updateDownloadIndex(downloadIndices, queuedDownload)
            await saveDownloadIndices(
                downloadIndices, mainOrigin, fileCache
            )
            await saveCargoIndices(
                cargoIndices, mainOrigin, fileCache
            )
            const prevFilecount = Object.keys(internalRecord).length
            const fetchResult = allFileCacheMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
            const {event, output} = createBgFetchEvent({
                id: downloadQueueId, 
                recordsAvailable: true,
                result: "failure",
                fetchResult
            })
            const handler = makeBackgroundFetchHandler({
                origin: mainOrigin, 
                fileCache, 
                log: () => {},
                type: "fail"
            })
            await handler(event)
            expect(output.ui.updateCalled).toBe(true)
            expect(!!output.ui.state).toBe(true)

            const finishedRequests = allFileCacheMeta.filter(
                (file) => file.status === 200
            )
            let errorLogFiles = 0
            for (const {files} of testCase) {
                const encounteredError = files.some(
                    (file) => file.status !== 200
                )
                if (encounteredError) {
                    errorLogFiles++
                }
            }
            expect(Object.keys(internalRecord).length).toBe(
                prevFilecount + finishedRequests.length + errorLogFiles
            )
            const indexesAfterUpdate = await getCargoIndices(
                mainOrigin, fileCache
            )
            for (const {origin, files} of testCase) {
                const shouldBeOk = files.every(
                    (file) => file.status === 200 
                )
                const resolvedUrl = origin + "/"
                const canonicalUrl = resolvedUrl
                const cargoIndex = indexesAfterUpdate.cargos.find(
                    (cargo) => cargo.canonicalUrl === canonicalUrl
                )
                const errorIndex = await getErrorDownloadIndex(
                    resolvedUrl,
                    fileCache
                )
                expect(!!cargoIndex).toBe(true)
                if (shouldBeOk) {
                    expect(cargoIndex?.state).toBe("cached")
                    expect(errorIndex).toBe(null)
                    continue
                }
                expect(cargoIndex?.state).toBe("update-failed")
                expect(errorIndex).not.toBe(null)
                // should only have one segment
                expect(errorIndex?.index.segments.length).toBe(1)
                expect(errorIndex?.index.previousId).toBe(downloadQueueId)
                const failedRequests = files
                    .filter((file) => file.status !== 200)
                    .map((file) => resolvedUrl + file.name)
                for (const url of failedRequests) {
                    const found = errorIndex?.index.segments[0].map[url]
                    expect(!!found).toBe(true)
                }
            }
        }
    })

    it("if download index storage root url is a relative url during fail handle, handler should add correct it to be a full url", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const storageExtension = "/pkg-store/"
        const resolvedUrl = origin + storageExtension
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
        const cargoId = "pkg"
        const canonicalUrl = remoteOrigin
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const downloadQueueId = nanoid(21)
        updateDownloadIndex(downloadIndices, createDownloadIndex({
            id: downloadQueueId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: storageExtension,
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = item
                return total
            }, {} as ResourceMap),
            bytes: 0
        }))
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            tag: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating",
            downloadQueueId: downloadQueueId
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event} = createBgFetchEvent({
            id: downloadQueueId, 
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
            log: () => {},
            type: "abort"
        })
        await handler(event)

        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        const errorLogFile = 1
        expect(Object.keys(internalRecord).length).toBe(
            prevFilecount + finishedRequests.length + errorLogFile
        )
        expect(
            (await getCargoIndices(origin, fileCache))
                .cargos
                .find((cargo) => cargo.canonicalUrl === canonicalUrl)?.state
        ).toBe("update-aborted")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it(`abort & fail handlers should fire on progress callback once`, async () => {
        const tests = [
            {eventName: "abort", origin: "https://cool-potatos.com"},
            {eventName: "fail", origin: "https://cool-tomates.com"},
        ] as const

        for (const {origin, eventName} of tests) {
            const canonicalUrl = origin + "/"
            const resolvedUrl = canonicalUrl
            const cacheFiles = [
                {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                {name: "index.js", status: 200, statusText: "OK", bytes: 0},
                {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
                {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
            ]
            const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
                storageUrl: resolvedUrl + name,
                bytes: 0,
                requestUrl: resolvedUrl + name,
                mime: urlToMime(name) || "text/plain",
                status,
                statusText
            }) as const)
            const {fileCache} = createFileCache({})
            const downloadIndices = emptyDownloadIndex()
            const downloadQueueId = nanoid(21)
            updateDownloadIndex(downloadIndices, createDownloadIndex({
                id: downloadQueueId,
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
            await saveDownloadIndices(downloadIndices, origin, fileCache)
            const cargoIndices = emptyCargoIndices()
            updateCargoIndex(cargoIndices, {
                tag: "pkg-" + Math.trunc(Math.random() * 5),
                resolvedUrl: resolvedUrl,
                entry: "index.js",
                name: "pkg-name",
                permissions: [],
                storageBytes: 0,
                logoUrl: "",
                bytes: 20,
                canonicalUrl,
                version: "0.1.0",
                state: "updating",
                downloadQueueId: downloadQueueId
            })
            await saveCargoIndices(
                cargoIndices, origin, fileCache
            )

            const {event, output} = createBgFetchEvent({
                id: downloadQueueId, 
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
            const progressEvents: ProgressUpdateRecord[] = []
            const handler = makeBackgroundFetchHandler({
                origin, 
                fileCache, 
                log: () => {},
                type: eventName,
                onProgress: (progress) => progressEvents.push(progress)
            })
            await handler(event)
            if (eventName === "abort") {
                expect(output.ui.updateCalled).toBe(false)
                expect(!!output.ui.state).toBe(false)
            } else {
                expect(output.ui.updateCalled).toBe(true)
                expect(!!output.ui.state).toBe(true)
            }
            expect(progressEvents.length).toBe(1)
            expect(progressEvents[0].type).toBe(eventName)
            expect(progressEvents[0].downloadId).toBe(downloadQueueId)
            expect(progressEvents[0].canonicalUrls).toStrictEqual([canonicalUrl])
        }
    })
})