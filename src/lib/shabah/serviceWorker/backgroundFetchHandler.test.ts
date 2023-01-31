import {describe, it, expect} from "vitest"
import {
    makeBackgroundFetchHandler
} from "./backgroundFetchHandler"
import {
    emptyDownloadIndex,
    updateDownloadIndex,
    saveDownloadIndices,
    emptyCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    ResourceMap,
    getCargoIndices
} from "../backend"
import {urlToMime} from "../../miniMime/index"

import {
    BackgroundFetchUIEventCore,
    BackgroundFetchResult,
} from "../../types/serviceWorkers"

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
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            resolvedUrl: origin + "/pkg-store",
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl: "https://remote-origin.site/pkg",
            version: "0.1.0",
            state: "cached"
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
        const {event, output} = createBgFetchEvent({id: cargoId})
        await handler(event)
        expect(
            Object.keys(internalRecord).length - prevFilecount
        ).toBe(0)
        expect(output.ui.updateCalled).toBe(false)
    })

    it("cache should not be changed if cargo indices doesn't exist", async () => {
        const origin = "https://cool-potatos.com"
        const cargoId = "pkg"
        const downloadIndices = emptyDownloadIndex()
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl: cargoId,
            map: {},
            bytes: 0
        })
        const {fileCache, internalRecord} = createFileCache({})
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const handler = makeBgFetchHandle({
            origin, 
            fileCache, 
            log: () => {},
            type: "success"
        })
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({id: cargoId})
        await handler(event)
        expect(
            Object.keys(internalRecord).length - prevFilecount
        ).toBe(0)
        expect(output.ui.updateCalled).toBe(false)
    })

    it("successful fetches should not cache responses not found in download index map", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        const canonicalUrl = remoteOrigin
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: "",
            canonicalUrl,
            map: {},
            bytes: 0
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            resolvedUrl: origin + "/pkg-store",
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating"
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
            id: canonicalUrl, 
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
                .find((cargo) => cargo.id === cargoId)?.state
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
        const cargoId = "pkg"
        const canonicalUrl = remoteOrigin
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
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
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            logoUrl: "",
            permissions: [],
            storageBytes: 0,
            name: "pkg-name",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: canonicalUrl, 
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
            (await getCargoIndices(origin, fileCache))
                .cargos
                .find((cargo) => cargo.id === cargoId)?.state
        ).toBe("cached")
    })
})

import {getErrorDownloadIndex} from "../backend"

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
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
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
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: canonicalUrl, 
            recordsAvailable: true,
            result: "success",
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
                .find((cargo) => cargo.id === cargoId)?.state
        ).toBe("update-failed")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.map || {}).length).toBe(
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
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
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
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: canonicalUrl, 
            recordsAvailable: true,
            result: "success",
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
                .find((cargo) => cargo.id === cargoId)?.state
        ).toBe("update-failed")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.map || {}).length).toBe(
            failedRequests.length
        )
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
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
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
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            resolvedUrl: resolvedUrl,
            entry: "index.js",
            name: "pkg-name",
            permissions: [],
            storageBytes: 0,
            logoUrl: "",
            bytes: 20,
            canonicalUrl,
            version: "0.1.0",
            state: "updating"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event} = createBgFetchEvent({
            id: canonicalUrl, 
            recordsAvailable: true,
            result: "success",
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
                .find((cargo) => cargo.id === cargoId)?.state
        ).toBe("update-aborted")
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.map || {}).length).toBe(
            failedRequests.length
        )
    })
})