import {
    FileCache,
    rootDocumentFallBackUrl,
} from "../backend"
import {
    serviceWorkerPolicies,
    serviceWorkerPolicyHeader,
    NETWORK_FIRST_POLICY,
    NETWORK_ONLY_POLICY,
    CACHE_ONLY_POLICY,
    ServiceWorkerPolicy,
    cacheHit, 
    errorResponse, 
    NOT_FOUND_RESPONSE,
    LogFn,
    logRequest
} from "../serviceWorkerMeta"

export type FetchHandlerEvent = {
    respondWith: (r: Response | PromiseLike<Response>) => void
    request: Request
    waitUntil: (promise: Promise<any>) => void
}

const CACHE_FIRST = serviceWorkerPolicies.cacheFirst["Sw-Policy"]

type ConfigReference = {
    log: boolean
}

export type FetchOptions = {
    origin: string,
    fileCache: FileCache
    fetchFile: typeof fetch,
    log: LogFn,
    config: Readonly<ConfigReference>
}

const cachefirstTag = "cache-first"
const cacheonlyTag = "cache-only"
const networkfirstTag = "network-first"

export const makeFetchHandler = (options: FetchOptions) => {
    const {origin, fileCache, fetchFile, log, config} = options
    const rootDoc = origin.endsWith("/") ? origin : origin + "/"
    const rootDocFallback = rootDocumentFallBackUrl(origin)
    return async (event: FetchHandlerEvent) => {
        const {request} = event

        const strippedQuery = request.url.split("?")[0]
        const isRootDocument = strippedQuery === rootDoc

        if (isRootDocument) {
            try {
                const res = await fetchFile(request)
                logRequest(
                    networkfirstTag, 
                    request,
                    log, 
                    config.log,
                    null
                )
                return res
            } catch (err) {
                const cached = await fileCache.getFile(rootDocFallback)
                logRequest(
                    networkfirstTag, 
                    request,
                    log, 
                    config.log,
                    cached
                )
                if (cached && cached.ok) {
                    return cacheHit(cached)
                }
                return errorResponse(err)
            }
        }

        const policyHeader = (
            request.headers.get(serviceWorkerPolicyHeader)
            || CACHE_FIRST
        )
        const policy = parseInt(policyHeader, 10) as ServiceWorkerPolicy

        switch (policy) {
            case NETWORK_ONLY_POLICY: {
                logRequest(
                    networkfirstTag, 
                    request, 
                    log, 
                    config.log,
                    null
                )
                return fetchFile(request)
            }
            case NETWORK_FIRST_POLICY: {
                try {
                    const res = await fetchFile(request)
                    logRequest(
                        networkfirstTag, 
                        request, 
                        log, 
                        config.log,
                        null
                    )
                    return res
                } catch (err) {
                    const cached = await fileCache.getFile(request.url)
                    logRequest(
                        networkfirstTag, 
                        request, 
                        log, 
                        config.log,
                        cached
                    )
                    if (cached && cached.ok) {
                        return cacheHit(cached)
                    }
                    return errorResponse(err)
                }
            }
            case CACHE_ONLY_POLICY: {
                const cached = await fileCache.getFile(request.url)
                logRequest(
                    cacheonlyTag, 
                    request, 
                    log, 
                    config.log,
                    cached
                )
                if (cached) {
                    return cacheHit(cached)
                }
                return NOT_FOUND_RESPONSE
            }
            default: {
                const cached = await fileCache.getFile(request.url)
                logRequest(
                    cachefirstTag, 
                    request,
                    log, 
                    config.log,
                    cached
                )
                if (cached && cached.ok) {
                    return cacheHit(cached)
                }
                return await fetchFile(event.request)
            }
        }
    }
}
