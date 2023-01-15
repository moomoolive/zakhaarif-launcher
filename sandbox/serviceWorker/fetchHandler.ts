import {generateTemplate} from "../templatingEngine/generateTemplateBase"
import {
    serviceWorkerCacheHitHeader as cacheHitHeader,
    serviceWorkerErrorCatchHeader as ErrorHeader
} from "../../src/lib/shabah/serviceWorkerMeta"

export type FileCache = {
    getClientFile: (clientId: string, url: string) => Promise<Response | undefined>
    getLocalFile: (url: string) => Promise<Response | undefined>
}

export type FetchHandlerEvent = {
    respondWith: (res: Promise<Response>) => any
    request: Request,
    waitUntil: (promise: Promise<any>) => any
}

type FetchHandlerOptions = {
    origin: string,
    fileCache: FileCache
    networkFetch: typeof fetch
}

const errorResponse = (err: unknown) => new Response(
    String(err), {
    status: 500,
    statusText: "INTERNAL SERVER ERROR",
    headers: {[ErrorHeader]: "1"}
})

const cacheHit = (response: Response) => {
    response.headers.append(cacheHitHeader.key, cacheHitHeader.value)
    return response
}

const containIo = async <T>(promise: Promise<T>) => {
    try {
        return await promise
    } catch {
        return null
    }
}

export const createFetchHandler = (options: FetchHandlerOptions) => {
    const {origin, fileCache, networkFetch} = options
    const rootDoc = `${origin}/`
    const offlineFallback = `${origin}/offline.html`
    const templateEndpoint = `${origin}/runProgram`
    const entryScript = `${origin}/secure.mjs`
    return async (event: FetchHandlerEvent) => {
        const {request} = event
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
            const cachedHtml = await fileCache.getLocalFile(offlineFallback)
            const baseHtml = cachedHtml && cachedHtml.ok
                ? cachedHtml
                : await containIo(networkFetch(rootDoc))
            if (!baseHtml || !baseHtml.ok) {
                return errorResponse("template endpoint can only be used after caching root document")
            }
            const {headers} = baseHtml
            const securityPolicy = decodeURIComponent(params.get("csp") || "")
            const importSource = decodeURIComponent(params.get("entry") || "")
            const templateText = generateTemplate({securityPolicy, importSource})
            return new Response(templateText, {
                status: 200,
                statusText: "OK",
                headers
            })
        }

        if (request.url.startsWith(entryScript)) {
            const cached = await fileCache.getLocalFile(entryScript)
            if (cached && cached.ok) {
                return cacheHit(cached)
            }
            return networkFetch(request)
        }

        if (request.url.startsWith(origin)) {
            return new Response("", {status: 404, statusText: "NOT FOUND"})
        }

        return networkFetch(request)
    }
}