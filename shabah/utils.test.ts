import {describe, it, expect} from "vitest"
import {io} from "../monads/result"
import {persistAssetList} from "./utils"

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

class FakeCacheEngine {
    readonly cache = {} as Record<string, Response>

    async put(request: RequestInfo | URL, response: Response) {
        const url = requestInfoToUrl(request)
        this.cache[url] = response
    }

    async match(request: RequestInfo | URL, _options?: CacheQueryOptions) {
        const url = requestInfoToUrl(request)
        const entry = this.cache[url]
        if (!entry) {
            return
        }
        return entry
    }

    keys() {
        return Object.keys(this.cache)
    }
}

type Resources = Readonly<Record<string, () => string>>

const fakeRequestEngine = (resources: Resources) => {
    return (input: RequestInfo | URL, {retryCount}: RequestInit & {retryCount: number}) => {
        const getResource = async () => {
            const url = requestInfoToUrl(input)
            const fn = resources[url]
            if (!fn) {
                throw new TypeError("you didn't define that resource")
            }
            return new Response(fn(), {
                status: 200, statusText: "OK"
            })
        }
        return io.retry(getResource, retryCount)
    }
}

describe("asset list cacher", () => {
    it("can cache a single or multiple asset correctly", async () => {
        const makeFiles = (res: Resources) => {
            return Object.keys(res).map(f => ({
                storageUrl: f, 
                requestUrl: f, 
                name: f, 
                bytes: 0
            }))
        }
        {
            const resources: Resources = {
                "index.js": () => `console.log('hi')`
            }
            const cache = new FakeCacheEngine()
            const files = makeFiles(resources)
            const res = await persistAssetList({
                files,
                requestEngine: fakeRequestEngine(resources),
                cacheEngine: cache
            })
            expect(res.failedRequests.length).toBe(0)
            expect(cache.keys().length).toBe(files.length)
            const matches =  await Promise.all(files.map(({name}) => cache.match(name)))
            expect(matches.every((m) => !!m)).toBe(true)
        }
        {
            const resources: Resources = {
                "index.js": () => `console.log('hi')`,
                "cool.json": () => `"json-cool"`,
                "s.css": () => `.my-class {}`,
            }
            const cache = new FakeCacheEngine()
            const files = makeFiles(resources)
            const res = await persistAssetList({
                files,
                requestEngine: fakeRequestEngine(resources),
                cacheEngine: cache
            })
            expect(res.failedRequests.length).toBe(0)
            expect(cache.keys().length).toBe(files.length)
            const matches =  await Promise.all(files.map(({name}) => cache.match(name)))
            expect(matches.every((m) => !!m)).toBe(true)
        }
    })

    it("should return files that failed to fetch if fetch error occurred and should not throw exception", async () => {
        const makeFiles = (res: Resources) => {
            return Object.keys(res).map(f => ({
                storageUrl: f, 
                requestUrl: f, 
                name: f, 
                bytes: 0
            }))
        }
        const resources: Resources = {
            "index.js": () => {
                if (true) {
                    throw new Error("fetch error")
                }
                return `console.log('hi')`
            }
        }
        const cache = new FakeCacheEngine()
        const files = makeFiles(resources)
        const res = await persistAssetList({
            files,
            requestEngine: fakeRequestEngine(resources),
            cacheEngine: cache
        })
        expect(res.failedRequests.length).toBe(1)
        expect(res.failedRequests[0].name).toBe("index.js")
        expect(cache.keys().length).toBe(0)
    })

    it("cached file should be cached at file.storageUrl and not file.requestUrl", async () => {
        const makeFiles = (res: Resources) => {
            return Object.keys(res).map(f => ({
                storageUrl: "storage_" + f, 
                requestUrl: f, 
                name: f, 
                bytes: 0
            }))
        }
        const resources: Resources = {
            "index.js": () => `console.log('hi')`,
            "cool.json": () => `"json-cool"`,
            "s.css": () => `.my-class {}`,
        }
        const cache = new FakeCacheEngine()
        const files = makeFiles(resources)
        const res = await persistAssetList({
            files,
            requestEngine: fakeRequestEngine(resources),
            cacheEngine: cache
        })
        expect(res.failedRequests.length).toBe(0)
        expect(cache.keys().length).toBe(files.length)
        const matches =  await Promise.all(files.map(({storageUrl}) => cache.match(storageUrl)))
        expect(matches.every((m) => !!m)).toBe(true)
        const notMatch =  await Promise.all(files.map(({requestUrl}) => cache.match(requestUrl)))
        expect(notMatch.every((m) => !!m)).toBe(false)
    })

    it("should cache files that do not encounter fetch error even if some files in list do", async () => {
        const storagePrefix = "storage_"
        const makeFiles = (res: Resources) => {
            return Object.keys(res).map(f => ({
                storageUrl: storagePrefix + f, 
                requestUrl: f, 
                name: f, 
                bytes: 0
            }))
        }
        const resources: Resources = {
            "index.js": () => `console.log('hi')`,
            "cool.json": () => `"json-cool"`,
            "s.css": () => `.my-class {}`,
            "err.js": () => {
                throw new Error("js err")
                return "alert('hi')"
            },
            "err.json": () => {
                throw new Error("js err")
                return `{"key": 0}`
            }
        }
        const cache = new FakeCacheEngine()
        const files = makeFiles(resources)
        const res = await persistAssetList({
            files,
            requestEngine: fakeRequestEngine(resources),
            cacheEngine: cache,
            logger: {
                warn: (...msg) => console.warn(...msg),
                info: (...msg) => console.info(...msg)
            }
        })
        const allRequests = Object.keys(resources)
        const errRequests = allRequests.filter((n) => n.startsWith("err"))
        const okRequests = allRequests.filter((n) => !n.startsWith("err"))
        expect(res.failedRequests.length).toBe(errRequests.length)
        expect(cache.keys().length).toBe(okRequests.length)
        const matches =  await Promise.all(okRequests.map((n) => cache.match(storagePrefix + n)))
        expect(matches.every((m) => !!m)).toBe(true)
    })
})