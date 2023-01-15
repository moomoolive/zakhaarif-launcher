import {
    FileCache,
    serviceWorkerCacheHitHeader,
    serviceWorkerErrorCatchHeader,
    serviceWorkerPolicies,
    serviceWorkerPolicyHeader,
    rootDocumentFallBackUrl,
    NETWORK_FIRST_POLICY,
    NETWORK_ONLY_POLICY,
    CACHE_FIRST_POLICY,
    CACHE_ONLY_POLICY,
    ServiceWorkerPolicy
} from "../backend"

export type FetchHandlerEvent = {
    respondWith: (r: Response | PromiseLike<Response>) => void
    request: Request
    waitUntil: (promise: Promise<any>) => void
}

const CACHE_HIT_HEADER = serviceWorkerCacheHitHeader.key
const CACHE_HIT_VALUE = serviceWorkerCacheHitHeader.value
const CACHE_FIRST = serviceWorkerPolicies.cacheFirst["Sw-Policy"]

const errorResponse = (err: unknown) => new Response(
    String(err), {
    status: 500,
    statusText: "Internal Server Error",
    headers: {
        [serviceWorkerErrorCatchHeader]: "1"
    }
})

const NOT_FOUND_RESPONSE = new Response("not in cache", {
    status: 404, 
    statusText: "NOT FOUND"
})

export type FetchOptions = {
    origin: string,
    fileCache: FileCache
    fetchFile: typeof fetch,
    log: (...msgs: any[]) => void
}

export const makeFetchHandler = (options: FetchOptions) => {
    const {origin, fileCache, fetchFile, log} = options
    const rootDoc = origin.endsWith("/")
        ? origin
        : origin + "/"
    const rootDocFallback = rootDocumentFallBackUrl(origin)
    return async (event: FetchHandlerEvent) => {
        const {request} = event

        const strippedQuery = request.url.split("?")[0]
        const isRootDocument = strippedQuery === rootDoc

        if (isRootDocument) {
            try {
                const res = await fetchFile(request)
                log(`requesting root document (network-first): url=${request.url}, status=${res.status}`)
                return res
            } catch (err) {
                const cached = await fileCache.getFile(rootDocFallback)
                log(`root doc request failed: fallback_url=${rootDocFallback}, network_err=true, status=${cached?.status || "none"}, status_text=${cached?.statusText || "none"}`)
                if (cached && cached.ok) {
                    cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
                    return cached 
                }
                return errorResponse(err)
            }
        } 

        const isRootFallback = strippedQuery === rootDocFallback
        if (isRootFallback) {
            const cached = await fileCache.getFile(rootDocFallback)
            log(`requesting root document fallback (cache-only): url=${request.url}, exists=${!!cached}, status=${cached?.status || "none"}`) 
            if (cached && cached.ok) {
                cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
                return cached
            }
            return NOT_FOUND_RESPONSE
        }

        const policyHeader = (
            request.headers.get(serviceWorkerPolicyHeader)
            || CACHE_FIRST
        )
        const policy = parseInt(policyHeader, 10) as ServiceWorkerPolicy

        switch (policy) {
            case NETWORK_FIRST_POLICY: {
                try {
                    const res = await fetchFile(request)
                    log(`incoming request (network-first): url=${request.url}, status=${res.status}`)
                    return res
                } catch (err) {
                    const cached = await fileCache.getFile(request.url)
                    const validCachedDoc = cached && cached.ok
                    log(`incoming request (network-first): url=${request.url}, network_err=true, cache_fallback=${validCachedDoc}`)
                    if (cached && cached.ok) {
                        cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
                        return cached 
                    }
                    return errorResponse(err)
                }
            }
            case NETWORK_ONLY_POLICY: {
                log(`incoming request (network-only): url=${event.request.url}`)
                return fetchFile(request)
            }
            case CACHE_ONLY_POLICY: {
                const cached = await fileCache.getFile(request.url)
                log(`incoming request (cache-only): url=${request.url}, found=${!!cached}, status=${cached?.status || "none"}`)
                if (cached && cached.ok) {
                    cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
                    return cached 
                }
                return NOT_FOUND_RESPONSE
            }
            case CACHE_FIRST_POLICY:
            default: {
                const cached = await fileCache.getFile(request.url)
                log(`incoming request (cache-first): url=${request.url}, cache_hit=${!!cached}, status=${cached?.status || "none"} destination=${request.destination}`)
                if (cached && cached.ok) {
                    cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
                    return cached
                }
                const res = await fetchFile(event.request)
                return res
            }
        }
    }
}
