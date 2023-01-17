import {generateTemplate} from "./generateTemplateBase"
import {cacheHit, NOT_FOUND_RESPONSE, errorResponse, LogFn} from "../../src/lib/shabah/serviceWorkerMeta"
import {fetchCore} from "../../src/lib/shabah/serviceWorker/fetchCore"

export type FileCache = {
    getClientFile: (url: string, clientId: string) => Promise<Response | null>
    getLocalFile: (url: string) => Promise<Response | undefined>
}

export type FetchHandlerEvent = {
    respondWith: (res: Promise<Response>) => any
    request: Request,
    waitUntil: (promise: Promise<any>) => any
    clientId: string
    resultingClientId: string
}

type ConfigReference = {
    log: boolean
}

type FetchHandlerOptions = {
    origin: string,
    fileCache: FileCache
    networkFetch: typeof fetch
    templateHeaders?: Readonly<{[key: string]: string}>
    log: LogFn
    config: Readonly<ConfigReference>
}

export const createFetchHandler = (options: FetchHandlerOptions) => {
    const {
        origin, 
        fileCache, 
        networkFetch, 
        templateHeaders = {},
        log,
        config,
    } = options
    const rootDoc = `${origin}/`
    const offlineFallback = `${origin}/offline.html`
    const templateEndpoint = `${origin}/runProgram`
    const entryScript = `${origin}/secure.compiled.js`
    const testScript = `${origin}/test.mjs`
    const clientCache = {getFile: fileCache.getClientFile} as const
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
                        ...templateHeaders,
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

        return fetchCore(
            request,
            networkFetch,
            clientCache,
            event.clientId || event.resultingClientId,
            log,
            config.log,
        )
    }
}
