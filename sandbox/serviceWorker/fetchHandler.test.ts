import {expect, it, describe} from "vitest"
import {createFetchHandler, FileCache, FetchHandlerEvent} from "./fetchHandler"
import {
    serviceWorkerCacheHitHeader as cacheHitHeader,
    serviceWorkerErrorCatchHeader as ErrorHeader
} from "../../src/lib/shabah/serviceWorkerMeta"

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

type DocumentHandlers = Record<string, () => Response>

class MockCache {
    readonly cache = {} as Record<string, () => Response>
    readonly accessLog = [] as Array<{url: string, time: number}>

    constructor(initCache?: DocumentHandlers) {
        this.cache = initCache || {}
        this.accessLog = []
    }

    async getFile(url: string) {
        this.accessLog.push({url, time: Date.now()})
        const entry = this.cache[url]
        if (!entry) {
            return
        }
        return entry()
    }
}

const createFileCache = ({
    localFileHandlers = {},
    clientFileHandlers = {},
    networkFileHandlers = {}
}: {
    localFileHandlers?: DocumentHandlers,
    clientFileHandlers?: DocumentHandlers,
    networkFileHandlers?: DocumentHandlers,
}) => {
    const localCache = new MockCache(localFileHandlers)
    const clientCache = new MockCache(clientFileHandlers)
    const networkCache = new MockCache(networkFileHandlers)
    const fileCache: FileCache = {
        getClientFile(_, url) {
            return clientCache.getFile(url)
        },
        getLocalFile(url) {
            return localCache.getFile(url)
        }
    }
    const networkFetch: typeof fetch = async (input) => {
        const url = requestInfoToUrl(input)
        const file = await networkCache.getFile(url)
        if (file) {
            return file
        }
        return new Response("", {status: 404})
    }
    return [{fileCache, networkFetch}, {
        localCache,
        clientCache,
        networkCache
    }] as const
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
    } as const
}

describe("fetch handler root document behaviour", () => {
    it("root document should always be network first", async () => {
        const origin = "https://donuts.com"
        const rootText = "root"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => new Response(rootText, {
                    status: 200
                })
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(rootText)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(true)
        expect(localCache.accessLog.length).toBe(0)
        expect(clientCache.accessLog.length).toBe(0)
    })

    it("root document should return network response even if response includes error http code", async () => {
        const origin = "https://donuts.com"
        const rootText = "error text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => new Response(rootText, {
                    status: 403
                })
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(403)
        expect(await res.text()).toBe(rootText)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(true)
        expect(localCache.accessLog.length).toBe(0)
        expect(clientCache.accessLog.length).toBe(0)
    })

    it("root document should return local cache response (/offline.html) if network error occurs", async () => {
        const origin = "https://donuts.com"
        const rootText = "error text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    throw new Error("network error")
                    return new Response(rootText, {
                        status: 403
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => new Response(cacheText, {status: 200})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)
        expect(res.headers.get(cacheHitHeader.key)).toBe(cacheHitHeader.value)
        expect(await res.text()).toBe(cacheText)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("root document should return response with code 500 if network error occurs and local cache file is not found (/offline.html)", async () => {
        const origin = "https://donuts.com"
        const rootText = "error text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    throw new Error("network error")
                    return new Response(rootText, {
                        status: 403
                    })
                },
            },
            localFileHandlers: {
                //[`${origin}/offline.html`]: () => new Response(cacheText, {status: 200})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(500)
        expect(res.headers.has(ErrorHeader)).toBe(true)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("root document should return response with code 500 if network error occurs and local cache file has an error http code (/offline.html)", async () => {
        const origin = "https://donuts.com"
        const rootText = "error text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    throw new Error("network error")
                    return new Response(rootText, {
                        status: 403
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(500)
        expect(res.headers.has(ErrorHeader)).toBe(true)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })
})

describe("fetch handler behaviour with template endpoint (/runProgram)", () => {
    it("should return 500 if request url does not have query parameter", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(500)
        expect(res.headers.has(ErrorHeader)).toBe(true)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            localCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 500 if request url does not have 'csp' or 'entry' parameters", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram`
        expect(
            (await handler(fetchEvent(`${origin}/runProgram?`).event)).status
        ).toBe(500)
        expect(
            (await handler(fetchEvent(`${origin}/runProgram?csp=true`).event)).status
        ).toBe(500)
        expect(
            (await handler(fetchEvent(`${origin}/runProgram?entry=true`).event)).status
        ).toBe(500)
        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            localCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 500 if request url has 'csp' and 'entry' parameters but root document not cached and cannot be reached by network", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                //[`${origin}/`]: () => {
                //    return new Response(rootText, {
                //        status: 200
                //    })
                //},
            },
            localFileHandlers: {
                //[`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.headers.has(ErrorHeader)).toBe(true)
        expect(res.status).toBe(500)
        expect(
            networkCache.accessLog.some((log) => log.url === `${origin}/`)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 500 if request url has 'csp' and 'entry' parameters but root document not cached and network error thrown when requesting root document", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    throw new Error("network error")
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                //[`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.headers.has(ErrorHeader)).toBe(true)
        expect(res.status).toBe(500)
        expect(
            networkCache.accessLog.some((log) => log.url === `${origin}/`)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 500 if request url has 'csp' and 'entry' parameters but root document not cached and network request to root document returns error http code", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 403
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.headers.has(ErrorHeader)).toBe(true)
        expect(res.status).toBe(500)
        expect(
            networkCache.accessLog.some((log) => log.url === `${origin}/`)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 200 if request url has 'csp' and 'entry' parameters and root document is not cached but reachable by network", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                //[`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)
        expect(
            networkCache.accessLog.some((log) => log.url === `${origin}/`)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 200 if request url has 'csp' and 'entry' parameters and root document is cached with error http code but reachable by network", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => new Response(cacheText, {status: 403})
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)
        expect(
            networkCache.accessLog.some((log) => log.url === `${origin}/`)
        ).toBe(true)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return 200 if request url has 'csp' and 'entry' parameters root document is cached", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {
                        status: 200,
                        headers: {
                            coolheader: "1",
                            trueheader: "2"
                        }
                    })
                }
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)

        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return exact same headers as cached root document", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                }
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=true&entry=index.js`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)

        const cachedDoc = (await localCache.getFile(`${origin}/offline.html`))!
        cachedDoc.headers.forEach((value, key) => {
            expect(res.headers.get(key)).toBe(value)
        })

        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })

    it("should return html document with content-security-policy in the csp param and a javascript import statement for entry param", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                }
            }
        })
        const csp = `default-src 'self'; script-src 'unsafe-inline'; child-src 'none'; worker-src 'self';`
        const entry = `https://pizza.com/index.js`
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const requestUrl = `${origin}/runProgram?csp=${encodeURIComponent(csp)}&entry=${encodeURIComponent(entry)}`
        const res = await handler(fetchEvent(requestUrl).event)
        expect(res.status).toBe(200)

        const htmlDoc = await res.text()
        expect(
            htmlDoc.includes(`<meta http-equiv="Content-Security-Policy" content="${csp}"/>`)
        ).toBe(true)
        expect(
            htmlDoc.includes(`<script entry="${entry}" id="root-script"`)
        ).toBe(true)

        expect(
            networkCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
        expect(
            localCache.accessLog.some((log) => log.url === `${origin}/offline.html`)
        ).toBe(true)
        expect(
            clientCache.accessLog.some((log) => log.url === requestUrl)
        ).toBe(false)
    })
})

describe("fetch handler behaviour with other resources on origin", () => {
    it("should 404 if attempt to access any resource other than secure.mjs on same origin", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                },
                [`${origin}/secure.mjs`]: () => {
                    return new Response("console.log(0)", {
                        status: 200,
                        headers: {
                            "content-type": "text/javascript"
                        }
                    })
                }
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        expect((await handler(fetchEvent(`${origin}/random.mjs`).event)).status).toBe(404)
        expect((await handler(fetchEvent(`${origin}/cool/path`).event)).status).toBe(404)
        expect((await handler(fetchEvent(`${origin}/cool/resource.html`).event)).status).toBe(404)
        expect(networkCache.accessLog.length).toBe(0)
        expect(localCache.accessLog.length).toBe(0)
        expect(clientCache.accessLog.length).toBe(0)
    })

    it("should return cached document if same origin request is to 'secure.mjs'", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const secureText = "console.log(0)"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                },
                [`${origin}/secure.mjs`]: () => {
                    return new Response(secureText, {
                        status: 200,
                        headers: {
                            "content-type": "text/javascript"
                        }
                    })
                }
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const secureScript = `${origin}/secure.mjs`
        const res = await handler(fetchEvent(secureScript).event)
        expect(res.status).toBe(200)
        expect(res.headers.get(cacheHitHeader.key)).toBe(cacheHitHeader.value)
        expect(await res.text()).toBe(secureText)
        expect(networkCache.accessLog.length).toBe(0)
        expect(localCache.accessLog.some((log) => log.url === secureScript)).toBe(true)
        expect(clientCache.accessLog.length).toBe(0)
    })

    it("should return network document if cached document not found and if same origin request is to 'secure.mjs'", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const secureText = "console.log(0)"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
                [`${origin}/secure.mjs`]: () => {
                    return new Response(secureText, {
                        status: 200,
                        headers: {
                            "content-type": "text/javascript"
                        }
                    })
                }
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                },
                //[`${origin}/secure.mjs`]: () => {
                //    return new Response(secureText, {
                //        status: 200,
                //        headers: {
                //            "content-type": "text/javascript"
                //        }
                //    })
                //}
            },
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const secureScript = `${origin}/secure.mjs`
        const res = await handler(fetchEvent(secureScript).event)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(secureText)
        expect(networkCache.accessLog.some((log) => log.url === secureScript)).toBe(true)
        expect(localCache.accessLog.some((log) => log.url === secureScript)).toBe(true)
        expect(clientCache.accessLog.length).toBe(0)
    })

    it("should return network document if cached document is found but has error http code and if same origin request is to 'secure.mjs'", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const secureText = "console.log(0)"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
                [`${origin}/secure.mjs`]: () => {
                    return new Response(secureText, {
                        status: 200,
                        headers: {
                            "content-type": "text/javascript"
                        }
                    })
                }
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                },
                [`${origin}/secure.mjs`]: () => {
                    return new Response(secureText, {
                        status: 403,
                        headers: {
                            "content-type": "text/javascript"
                        }
                    })
                }
            },
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const secureScript = `${origin}/secure.mjs`
        const res = await handler(fetchEvent(secureScript).event)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe(secureText)
        expect(networkCache.accessLog.some((log) => log.url === secureScript)).toBe(true)
        expect(localCache.accessLog.some((log) => log.url === secureScript)).toBe(true)
        expect(clientCache.accessLog.length).toBe(0)
    })

    it("should return secure.mjs document if request has query", async () => {
        const origin = "https://donuts.com"
        const rootText = "root text"
        const cacheText = "cache text"
        const secureText = "console.log(0)"
        const [adaptors, caches] = createFileCache({
            networkFileHandlers: {
                [`${origin}/`]: () => {
                    return new Response(rootText, {
                        status: 200
                    })
                },
            },
            localFileHandlers: {
                [`${origin}/offline.html`]: () => {
                    return new Response(cacheText, {status: 200})
                },
                [`${origin}/secure.mjs`]: () => {
                    return new Response(secureText, {
                        status: 200,
                        headers: {
                            "content-type": "text/javascript"
                        }
                    })
                }
            }
        })
        const {networkCache, localCache, clientCache} = caches
        const handler = createFetchHandler({origin, ...adaptors})
        const secureScript = `${origin}/secure.mjs`
        const withQuery = secureScript + "?q=true"
        const res = await handler(fetchEvent(withQuery).event)
        expect(res.status).toBe(200)
        expect(res.headers.get(cacheHitHeader.key)).toBe(cacheHitHeader.value)
        expect(await res.text()).toBe(secureText)
        expect(networkCache.accessLog.length).toBe(0)
        expect(localCache.accessLog.some((log) => log.url === secureScript)).toBe(true)
        expect(clientCache.accessLog.length).toBe(0)
    })
})