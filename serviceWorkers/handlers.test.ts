import {makeFetchHandler, FetchHandlerEvent} from "./handlers"
import {expect, it, describe} from "vitest"

const requestInfoToUrl = (request: RequestInfo | URL) => {
    if (typeof request === "string") {
        return request
    } else if (request instanceof Request) {
        return request.url
    } else if (request instanceof URL) {
        return request.href
    } else {
        return request as string
    }
}

class CacheEngine {
    readonly cache = {} as Record<string, () => Response>
    readonly accessLog = [] as Array<{url: string, time: number}>

    constructor(initCache?: Record<string, () => Response>) {
        this.cache = initCache || {}
        this.accessLog = []
    }

    async match(request: RequestInfo | URL, _options?: CacheQueryOptions) {
        const url = requestInfoToUrl(request)
        this.accessLog.push({url, time: Date.now()})
        const entry = this.cache[url]
        if (!entry) {
            return
        }
        return entry()
    }
}

const fetchEvent = (url: string) => {
    const output = {
        response: null as null | PromiseLike<Response> | Response
    }
    return {
        output,
        event: {
            res: null,
            respondWith: (res) => { output.response = res },
            request: new Request(url)
        } as FetchHandlerEvent
    }
}

describe("fetch handler", () => {
    it("root document should be requested from network first and return if exists", async () => {
        const rootDoc = "https://coolio.site/"
        const networkText = "network"
        const responses = new CacheEngine({
            [rootDoc]: () => new Response(networkText, {
                status: 200,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [rootDoc]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const {output, event} = fetchEvent(rootDoc)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === rootDoc)
        expect(!!cacheAccessed).toBe(false)
        expect((await output.response)?.status).toBe(200)
        expect(await (await output.response)?.text()).toBe(networkText)
    })

    it("root document should be requested from cache if network error occurrs", async () => {
        const rootDoc = "https://coolio.site/"
        const networkText = "network"
        const responses = new CacheEngine({
            [rootDoc]: () => {
                throw new Error("network error")
                return new Response(networkText, {
                    status: 200,
                    statusText: "OK"
                })
            }
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [rootDoc]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const {output, event} = fetchEvent(rootDoc)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === rootDoc)
        expect(!!cacheAccessed).toBe(true)
        expect((await output.response)?.status).toBe(200)
        expect(await (await output.response)?.text()).toBe(cacheText)
    })

    it("root document return request with 500 if network error occurs and root document is in cache with error http code", async () => {
        const rootDoc = "https://coolio.site/"
        const networkText = "network"
        const responses = new CacheEngine({
            [rootDoc]: () => {
                throw new Error("network error")
                return new Response(networkText, {
                    status: 200,
                    statusText: "OK"
                })
            }
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [rootDoc]: () => new Response("not here", {
                status: 404,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const {output, event} = fetchEvent(rootDoc)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === rootDoc)
        expect(!!cacheAccessed).toBe(true)
        expect((await output.response)?.status).toBe(500)
        expect(await (await output.response)?.text()).not.toBe(cacheText)
    })

    it("root document return request with 500 if network error occurs and root document is not in cache", async () => {
        const rootDoc = "https://coolio.site/"
        const networkText = "network"
        const responses = new CacheEngine({
            [rootDoc]: () => {
                throw new Error("network error")
                return new Response(networkText, {
                    status: 200,
                    statusText: "OK"
                })
            }
        })
        const cacheText = "cache"
        const cache = new CacheEngine({})
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const {output, event} = fetchEvent(rootDoc)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === rootDoc)
        expect(!!cacheAccessed).toBe(true)
        expect((await output.response)?.status).toBe(500)
        expect(await (await output.response)?.text()).not.toBe(cacheText)
    })

    it("if response is not in cache and doesn't have a network-first policy nothing should be returned", async () => {
        const rootDoc = "https://coolio.site/"
        const responses = new CacheEngine({})
        const cache = new CacheEngine({})
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const requestUrl = "https://coolio.site/random"
        const {output, event} = fetchEvent(requestUrl)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect((await output.response)).toBe(null)
    })

    it("if response is in cache with error http code and doesn't have a network-first policy nothing should be returned", async () => {
        const rootDoc = "https://coolio.site/"
        const responses = new CacheEngine({})
        const requestUrl = "https://coolio.site/random"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response("", {status: 404})
        })
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const {output, event} = fetchEvent(requestUrl)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect((await output.response)).toBe(null)
    })

    it("if response is in cache and doesn't have a network-first policy cached response should be returned", async () => {
        const rootDoc = "https://coolio.site/"
        const responses = new CacheEngine({})
        const requestUrl = "https://coolio.site/random"
        const requestText = "hello world"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(requestText, {
                status: 200
            })
        })
        const handler = makeFetchHandler({
            cache: Promise.resolve(cache),
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.match(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            rootDoc
        })
        const {output, event} = fetchEvent(requestUrl)
        await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect((await (await output.response)?.text())).toBe(requestText)
        expect((await output.response)?.status).toBe(200)
    })
})

import {
    BackgroundFetchUIEventCore,
    BackgroundFetchResult,
} from "./handlers"

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
        },
        queryUsage: async () => ({usage: 0, quota: 0})
    }
    return {fileCache: cache, internalRecord: initFiles}
}

import {
    makeBackgroundFetchSuccessHandler
} from "./handlers"
import {
    emptyDownloadIndex,
    updateDownloadIndex,
    saveDownloadIndices,
    emptyCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    ResourceMap,
    getCargoIndices
} from "../shabah/shared"
import {urlToMime} from "../miniMime/index"

describe("background fetch success handler", () => {
    const makeBgFetchHandle = makeBackgroundFetchSuccessHandler

    it("cache should not be changed if download indices doesn't exist", async () => {
        const origin = "https://cool-potatos.com"
        const cargoId = "pkg"
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            storageRootUrl: origin + "/pkg-store",
            entry: "index.js",
            name: "pkg-name",
            bytes: 20,
            requestRootUrl: "https://remote-origin.site/pkg",
            version: "0.1.0",
            state: "cached"
        })
        const {fileCache, internalRecord} = createFileCache({})
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const handler = makeBgFetchHandle({origin, fileCache})
        const {event, output} = createBgFetchEvent({id: cargoId})
        handler(event)
        await output.finishPromise
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
            map: {},
            bytes: 0
        })
        const {fileCache, internalRecord} = createFileCache({})
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const handler = makeBgFetchHandle({origin, fileCache})
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({id: cargoId})
        handler(event)
        await output.finishPromise
        expect(
            Object.keys(internalRecord).length - prevFilecount
        ).toBe(0)
        expect(output.ui.updateCalled).toBe(false)
    })

    it("cache should not be changed if background fetch records are not ready", async () => {
        const origin = "https://cool-potatos.com"
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            map: {},
            bytes: 0
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            storageRootUrl: origin + "/pkg-store",
            entry: "index.js",
            name: "pkg-name",
            bytes: 20,
            requestRootUrl: "https://remote-origin.site/pkg",
            version: "0.1.0",
            state: "cached"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const handler = makeBgFetchHandle({origin, fileCache})
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: cargoId, recordsAvailable: false
        })
        handler(event)
        await output.finishPromise
        expect(
            Object.keys(internalRecord).length - prevFilecount
        ).toBe(0)
        expect(output.ui.updateCalled).toBe(false)
    })

    it("cache should not be changed if background fetch result is not successful", async () => {
        const origin = "https://cool-potatos.com"
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            map: {},
            bytes: 0
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            storageRootUrl: origin + "/pkg-store",
            entry: "index.js",
            name: "pkg-name",
            bytes: 20,
            requestRootUrl: "https://remote-origin.site/pkg",
            version: "0.1.0",
            state: "cached"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const handler = makeBgFetchHandle({origin, fileCache})
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: cargoId, 
            recordsAvailable: true,
            result: "failure"
        })
        handler(event)
        await output.finishPromise
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
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            map: {},
            bytes: 0
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            storageRootUrl: origin + "/pkg-store",
            entry: "index.js",
            name: "pkg-name",
            bytes: 20,
            requestRootUrl: remoteOrigin + "/pkg",
            version: "0.1.0",
            state: "updating"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const handler = makeBgFetchHandle({origin, fileCache})
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: cargoId, 
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
        handler(event)
        await output.finishPromise
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
        const storageRootUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            "cargo.json",
            "index.js",
            "perf.wasm",
            "icon.png",
        ]
        const cacheFileMeta = cacheFiles.map((name) => ({
            storageUrl: storageRootUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain"
        }) as const)
        const cargoId = "pkg"
        const {fileCache, internalRecord} = createFileCache({})
        const downloadIndices = emptyDownloadIndex()
        updateDownloadIndex(downloadIndices, {
            id: cargoId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = {
                    bytes: 0,
                    storageUrl: item.storageUrl,
                    mime: item.mime
                }
                return total
            }, {} as ResourceMap),
            bytes: 0
        })
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        const cargoIndices = emptyCargoIndices()
        updateCargoIndex(cargoIndices, {
            id: cargoId,
            storageRootUrl: storageRootUrl,
            entry: "index.js",
            name: "pkg-name",
            bytes: 20,
            requestRootUrl: remoteRootUrl,
            version: "0.1.0",
            state: "updating"
        })
        await saveCargoIndices(cargoIndices, origin, fileCache)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: cargoId, 
            recordsAvailable: true,
            result: "success",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response("", {status: 200})
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBgFetchHandle({origin, fileCache})
        handler(event)
        await output.finishPromise
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