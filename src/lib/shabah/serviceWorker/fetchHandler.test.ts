import {makeFetchHandler, FetchHandlerEvent} from "./fetchHandler"
import {expect, it, describe} from "vitest"
import {rootDocumentFallBackUrl} from "../backend"
import {
    serviceWorkerCacheHitHeader, 
    serviceWorkerErrorCatchHeader,
    serviceWorkerPolicies
} from "../backend"


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

    async getFile(url: string) {
        this.accessLog.push({url, time: Date.now()})
        const entry = this.cache[url]
        if (!entry) {
            return null
        }
        return entry()
    }

    async putFile(url: string, file: Response) {
        return true
    }

    async queryUsage() {
        return {usage: 0, quota: 0}
    }

    async deleteFile(url: string) {
        return true
    }

    async deleteAllFiles() {
        return true
    }

    async isPersisted() { return true }
    async requestPersistence() { return true }
    async listFiles() { return [] as const }
}

const fetchEvent = (url: string, headers: Record<string, string> = {}) => {
    const output = {
        response: null as null | PromiseLike<Response> | Response
    }
    return {
        output,
        event: {
            res: null,
            respondWith: (res) => { output.response = res },
            request: new Request(url, {headers}),
            waitUntil: () => {}
        } as FetchHandlerEvent
    }
}

const swCache = serviceWorkerCacheHitHeader
const swError = serviceWorkerErrorCatchHeader

describe("fetch handler", () => {
    it("root document should be requested from network first and return if exists", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/`
        const fallback = rootDocumentFallBackUrl(origin)
        const networkText = "network"
        const responses = new CacheEngine({
            [rootDoc]: () => new Response(networkText, {
                status: 200,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [fallback]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(false)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(networkText)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("root document should be requested from network first and return if exists, even if status is not ok", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/`
        const fallback = rootDocumentFallBackUrl(origin)
        const networkText = "network"
        const responses = new CacheEngine({
            [rootDoc]: () => new Response(networkText, {
                status: 403,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [fallback]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(false)
        expect(res.status).toBe(403)
        expect(await res.text()).toBe(networkText)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("root document should be requested from cache if network error occurrs, from fallback url", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/`
        const fallback = rootDocumentFallBackUrl(origin)
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
            [fallback]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
    })

    it("root document should be requested from cache if network error occurrs, from fallback url, even if request url has a query", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/?query_town=1`
        const fallback = rootDocumentFallBackUrl(origin)
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
            [fallback]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin,
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
    })

    it("root document should be requested from cache if network error occurrs, from fallback url even if a query is present in url", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/?random_query=true`
        const fallback = rootDocumentFallBackUrl(origin)
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
            [fallback]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: origin,
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
    })

    it("root document return request with 500 if network error occurs and root document is in cache with error http code", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/`
        const fallback = rootDocumentFallBackUrl(origin)
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
            [fallback]: () => new Response("not here", {
                status: 404,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(500)
        expect(!!res.headers.get(swError)).toBe(true)
        expect(await res.text()).not.toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("root document return request with 500 if network error occurs and root document is not in cache", async () => {
        const origin = "https://coolio.site"
        const rootDoc = `${origin}/`
        const fallback = rootDocumentFallBackUrl(origin)
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
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(rootDoc)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === rootDoc)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === fallback)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(500)
        expect(!!res.headers.get(swError)).toBe(true)
        expect(await res.text()).not.toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("if response is not in cache and doesn't have a network-first policy an network attempt should be made", async () => {
        const rootDoc = "https://coolio.site/"
        const responses = new CacheEngine({})
        const cache = new CacheEngine({})
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const requestUrl = "https://coolio.site/random"
        const {event} = fetchEvent(requestUrl)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("if response is in cache with error http code and doesn't have a network-first policy, network request should be fired", async () => {
        const rootDoc = "https://coolio.site/"
        const responses = new CacheEngine({})
        const requestUrl = "https://coolio.site/random"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response("", {status: 404})
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(requestUrl)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.headers.get(swCache.key)).toBe(null)
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
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(requestUrl)
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
        expect((await res.text())).toBe(requestText)
        expect(res.status).toBe(200)
    })

    it("if response is in cache and request uses a network-only, file should be requested from network", async () => {
        const rootDoc = "https://coolio.site/"
        const requestUrl = "https://coolio.site/random"
        const networkText = "requesty"
        const responses = new CacheEngine({
            [requestUrl]: () => new Response(networkText, {status: 200})
        })
        const cacheText = "hello world"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkOnly
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(false)
        expect(res.headers.get(swCache.key)).toBe(null)
        expect((await res.text())).toBe(networkText)
        expect(res.status).toBe(200)
    })

    it("if response is in cache, request uses a network-only only policy, and file is not on remote server, cache response should not be returned", async () => {
        const rootDoc = "https://coolio.site/"
        const requestUrl = "https://coolio.site/random"
        const networkText = "requesty"
        const responses = new CacheEngine({
            //[requestUrl]: () => new Response(networkText, {status: 200})
        })
        const cacheText = "hello world"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkOnly
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(false)
        expect(res.headers.get(swCache.key)).toBe(null)
        expect(res.status).toBe(404)
    })

    it("if response is in cache, request uses network-only policy, cache response should not be returned", async () => {
        const rootDoc = "https://coolio.site/"
        const requestUrl = "https://coolio.site/random"
        const networkText = "requesty"
        const responses = new CacheEngine({
            [requestUrl]: () => {
                throw new Error("network error")
                return new Response(networkText, {status: 200})
            }
        })
        const cacheText = "hello world"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: rootDoc.slice(0, -1),
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkOnly
        )
        try {
            // returns error to caller
            await handler(event)
            expect(true).toBe(false)
        } catch {
            expect(true).toBe(true)
        }
    })

    it("request that has from network-first policy should request from network first and return if exists", async () => {
        const origin = "https://coolio.site"
        const requestUrl = `${origin}/my-cool.json`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => new Response(networkText, {
                status: 200,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkFirst
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(false)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(networkText)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("request that has from network-first policy should request from network first and return if exists, even if response code is not ok", async () => {
        const origin = "https://coolio.site"
        const requestUrl = `${origin}/my-cool.json`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => new Response(networkText, {
                status: 422,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkFirst
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(false)
        expect(res.status).toBe(422)
        expect(await res.text()).toBe(networkText)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("request that has from network-first policy should request from network first and return from cache if network request fails", async () => {
        const origin = "https://coolio.site"
        const requestUrl = `${origin}/my-cool.json`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => {
                throw new Error("network error")
                return new Response(networkText, {
                    status: 200,
                    statusText: "OK"
                })
            }
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkFirst
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
    })

    it("request that has a network-first policy should request from network first, then cache if network error occurred, and then return 500 response if cache response not ok", async () => {
        const origin = "https://coolio.site"
        const requestUrl = `${origin}/my-cool.json`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => {
                throw new Error("network error")
                return new Response(networkText, {
                    status: 200,
                    statusText: "OK"
                })
            }
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 403,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkFirst
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(500)
        expect(res.headers.get(swCache.key)).toBe(null)
    })

    it("request that has a network-first policy should request from network first, then cache if network error occurred, and then return 500 response if cache response not found", async () => {
        const origin = "https://coolio.site"
        const requestUrl = `${origin}/my-cool.json`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => {
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
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin: origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.networkFirst
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(true)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(500)
        expect(res.headers.get(swCache.key)).toBe(null)
    })
})

describe("service worker header policies", () => {
    it("if request has cache-only header it should be requested from cache and return if found", async () => {
        const origin = "https://hi.com"
        const requestUrl = `${origin}/my-doc.html`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => new Response(networkText, {
                status: 200,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 200,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.cacheOnly
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
    })

    it("if request has cache-only header it should be requested from cache and return if found, even if http code is not ok", async () => {
        const origin = "https://hi.com"
        const requestUrl = `${origin}/my-doc.html`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => new Response(networkText, {
                status: 200,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({
            [requestUrl]: () => new Response(cacheText, {
                status: 401,
                statusText: "OK"
            })
        })
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 404})
            },
            origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.cacheOnly
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(401)
        expect(await res.text()).toBe(cacheText)
        expect(res.headers.get(swCache.key)).toBe(swCache.value)
    })

    it("if request has cache-only header it should be requested from cache and if not found should return 404", async () => {
        const origin = "https://hi.com"
        const requestUrl = `${origin}/my-doc.html`
        const networkText = "network"
        const responses = new CacheEngine({
            [requestUrl]: () => new Response(networkText, {
                status: 200,
                statusText: "OK"
            })
        })
        const cacheText = "cache"
        const cache = new CacheEngine({})
        const handler = makeFetchHandler({
            fileCache: cache,
            config: {log: true},
            fetchFile: async (request) => {
                const url = requestInfoToUrl(request)
                const response = await responses.getFile(url)
                if (response) {
                    return response
                }
                return new Response("", {status: 500})
            },
            origin,
            log: () => {}
        })
        const {event} = fetchEvent(
            requestUrl, serviceWorkerPolicies.cacheOnly
        )
        const res = await handler(event)
        const fetchFired = responses.accessLog.find((log) => log.url === requestUrl)
        expect(!!fetchFired).toBe(false)
        const cacheAccessed = cache.accessLog.find((log) => log.url === requestUrl)
        expect(!!cacheAccessed).toBe(true)
        expect(res.status).toBe(404)
        expect(res.headers.get(swCache.key)).toBe(null)
    })
})
