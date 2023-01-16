import {generateTemplate} from "./generateTemplateBase"
import {
    serviceWorkerPolicyHeader as policyHeader,
    serviceWorkerPolicies as policies,
    ServiceWorkerPolicy,
    NETWORK_FIRST_POLICY,
    NETWORK_ONLY_POLICY,
    CACHE_ONLY_POLICY,
    cacheHit,
    NOT_FOUND_RESPONSE,
    errorResponse
} from "../../src/lib/shabah/serviceWorkerMeta"

const CACHE_FIRST = policies.cacheFirst["Sw-Policy"]

export type FileCache = {
    getFile: (url: string, clientId: string) => Promise<Response | undefined>
    getLocalFile: (url: string) => Promise<Response | undefined>
}

export type FetchHandlerEvent = {
    respondWith: (res: Promise<Response>) => any
    request: Request,
    waitUntil: (promise: Promise<any>) => any
    clientId: string
    resultingClientId: string
}

const safeRequest = async (request: Promise<Response>) => {
    try {
        return await request
    } catch (err) {
        return errorResponse(err)
    }
}

type FetchHandlerOptions = {
    origin: string,
    fileCache: FileCache
    networkFetch: typeof fetch
}

export const createFetchHandler = (options: FetchHandlerOptions) => {
    const {origin, fileCache, networkFetch} = options
    const rootDoc = `${origin}/`
    const offlineFallback = `${origin}/offline.html`
    const templateEndpoint = `${origin}/runProgram`
    const entryScript = `${origin}/secure.compiled.js`
    const testScript = `${origin}/test.mjs`
    return async (event: FetchHandlerEvent) => {
        const {request} = event
        if (request.url.startsWith(origin)) {
            if (request.url === rootDoc) {
                try {
                    return await networkFetch(request)
                } catch (err) {
                    const offlineDoc = await fileCache.getLocalFile(offlineFallback)
                    if (offlineDoc && offlineDoc.ok) {
                        return cacheHit(offlineDoc)
                    }
                    return errorResponse(`fallback doc not found. ${err}`)
                }
            }
    
            if (request.url.startsWith(templateEndpoint)) {
                const query = request.url.split("?")
                if (query.length < 2) {
                    return errorResponse("template endpoint must have query")
                }
                const params = new URLSearchParams("?" + query[1])
                if (!params.has("csp") || !params.has("entry")) {
                    return errorResponse("template endpoint have both an 'csp' and 'entry' query")
                }
                const securityPolicy = decodeURIComponent(params.get("csp") || "")
                const importSource = decodeURIComponent(params.get("entry") || "")
                const templateText = generateTemplate({securityPolicy, importSource})
                return new Response(templateText, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-type": "text/html",
                        "content-length": new TextEncoder().encode(templateText).length.toString(),
                        "Cross-Origin-Embedder-Policy": "require-corp",
                        "Cross-Origin-Opener-Policy": "same-origin",
                        "Cross-Origin-Resource-Policy": "cross-origin",
                    }
                })
            }
    
            if (request.url.startsWith(entryScript)) {
                const cached = await fileCache.getLocalFile(entryScript)
                if (cached && cached.ok) {
                    return cacheHit(cached)
                }
                return networkFetch(request)
            }

            if (request.url.startsWith(testScript)) {
                return networkFetch(request)
            }
            return NOT_FOUND_RESPONSE
        }

        const policyString = (
            request.headers.get(policyHeader)
            || CACHE_FIRST
        )
        const policy = parseInt(policyString, 10) as ServiceWorkerPolicy
        const targetClientId = event.clientId || event.resultingClientId

        switch (policy) {
            case NETWORK_ONLY_POLICY: {
                return await safeRequest(networkFetch(request))
            }
            case NETWORK_FIRST_POLICY: {
                try {
                    const res = await networkFetch(request)
                    return res
                } catch (err) {
                    const cached = await fileCache.getFile(request.url, targetClientId)
                    if (cached && cached.ok) {
                        return cacheHit(cached)
                    }
                    return errorResponse(err)
                }
            }
            case CACHE_ONLY_POLICY: {
                const cached = await fileCache.getFile(request.url, targetClientId)
                if (cached) {
                    return cacheHit(cached)
                }
                return NOT_FOUND_RESPONSE
            }
            default: {
                const cached = await fileCache.getFile(request.url, targetClientId)
                if (cached && cached.ok) {
                    return cacheHit(cached)
                }
                return await safeRequest(networkFetch(event.request))
            }
        }
    }
}