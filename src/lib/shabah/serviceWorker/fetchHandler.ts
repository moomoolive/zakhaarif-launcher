import {
	FileCache,
	rootDocumentFallBackUrl,
} from "../backend"
import {
	cacheHit, 
	errorResponse,
	LogFn,
	logRequest
} from "../serviceWorkerMeta"
import {fetchCore} from "./fetchCore"

export type FetchHandlerEvent = {
    respondWith: (r: Response | PromiseLike<Response>) => void
    request: Request
    waitUntil: (promise: Promise<unknown>) => void
}

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

		return fetchCore(
			request,
			fetchFile,
			fileCache,
			"",
			log,
			config.log
		)
	}
}
