import {
    getDownloadIndices,
    removeDownloadIndex,
    saveDownloadIndices,
    getCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    FileCache,
    headers,
    removeSlashAtEnd,
    serviceWorkerCacheHitHeader,
    serviceWorkerErrorCatchHeader,
    serviceWorkerPolicies,
    serviceWorkerPolicyHeader,
    DownloadIndex,
    saveErrorDownloadIndex,
} from "../shabah/shared"

export type FetchHandlerEvent = {
    respondWith: (r: Response | PromiseLike<Response>) => void
    request: Request
    waitUntil: (promise: Promise<any>) => void
}

export type CacheImplementation = {
    match: (url: RequestInfo | URL, options?: CacheQueryOptions) => Promise<Response | void>
}

export type FetchOptions = {
    rootDoc: string,
    cache: FileCache
    fetchFile: typeof fetch,
    log: (...msgs: any[]) => void
}

const CACHE_HIT_HEADER = serviceWorkerCacheHitHeader.key
const CACHE_HIT_VALUE = serviceWorkerCacheHitHeader.value
const NETWORK_ONLY = serviceWorkerPolicies.networkOnly["Sw-Policy"]
const NETWORK_FIRST = serviceWorkerPolicies.networkFirst["Sw-Policy"]

export const makeFetchHandler = (options: FetchOptions) => {
    const {rootDoc, cache, fetchFile, log} = options
    return async (event: FetchHandlerEvent) => {
        const {request} = event
        
        const policy = request.headers.get(serviceWorkerPolicyHeader) 
        if (policy === NETWORK_ONLY) {
            log(`incoming request (network-only): url=${event.request.url}`)
            return fetchFile(request)
        }

        if (policy === NETWORK_FIRST || request.url === rootDoc) {
            try {
                const res = await fetchFile(event.request)
                log(`incoming request (network-first): url=${event.request.url}, status=${res.status}`)
                return res
            } catch (err) {
                const cached = await cache.getFile(event.request.url)
                const validCachedDoc = cached && cached.ok
                log(`incoming request (network-first): url=${event.request.url}, network_err=true, cache_fallback=${validCachedDoc}`)
                if (cached && cached.ok) {
                    cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
                    return cached 
                }
                return new Response("", {
                    status: 500,
                    statusText: "Internal Server Error",
                    headers: {
                        [serviceWorkerErrorCatchHeader]: String(err) || "1"
                    }
                })
            }
        }

        // default policy => cache-first
        const cached = await cache.getFile(event.request.url)
        log(`incoming request (cache-first): url=${event.request.url}, cache_hit=${!!cached}, status=${cached?.status || "none"}`)
        if (cached && cached.ok) {
            //event.respondWith(cached)
            cached.headers.append(CACHE_HIT_HEADER, CACHE_HIT_VALUE)
            return cached 
        }
        return fetchFile(event.request)
    }
}

// the below types are an incomplete type implementation
// of the background fetch api. link: https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API
export type BackgroundFetchRecord = {
    readonly request: Request
    readonly responseReady: Promise<Response>
}

export type BackgroundFetchUpdateUIOptions = Partial<{
    title: string
    icons: Array<{
        label?: string
        type?: (
            "image/png" | "image/gif" | "image/bmp" | "image/jpeg"
            | "image/x-png"
        )
        src: string
        sizes?: string
    }>
}>

export type BackgroundFetchResult = "" | "success" | "failure"

export type BackgroundFetchFailureReason = (
    "" | "aborted" | "bad-status"
    | "fetch-error" | "quota-exceeded"
    | "download-total-exceeded"
)

export type BackgroundFetchRegistration = {
   readonly id: string
   readonly uploadTotal: number 
   readonly uploaded: number 
   readonly downloadTotal: number 
   readonly downloaded: number 
   readonly result: BackgroundFetchResult
   readonly failureReason: BackgroundFetchFailureReason
   readonly recordsAvailable: boolean
   abort: () => Promise<boolean>
   // honestly not sure how this works
   //match: () => Promise<BackgroundFetchRecord | undefined>
   matchAll: () => Promise<BackgroundFetchRecord[]>
   addEventListener: (
    eventName: "progress",
    callback: (event: Event) => any
   ) => void
   onprogress: (event: Event) => any
}

export type BackgroundFetchManager = {
    fetch: (
        id: string, 
        requests: string[], 
        options?: Partial<{title: string, downloadTotal: number}>
    ) => Promise<BackgroundFetchRegistration>
    get: (id: string) => Promise<BackgroundFetchRegistration | undefined>
    getIds: () => Promise<string[]>
}

export type BackgroundFetchEvent = {
    waitUntil: (promise: Promise<any>) => any
    readonly registration: BackgroundFetchRegistration
}

type UpdateUIMethod = (options: BackgroundFetchUpdateUIOptions) => Promise<void>

export type BackgroundFetchUIEventCore = BackgroundFetchEvent & {
    updateUI: UpdateUIMethod
}

export type BackgroundFetchHandlerEvent = BackgroundFetchEvent & {
    updateUI?: UpdateUIMethod
}

export type BackgroundFetchEvents = (
    "backgroundfetchsuccess" | "backgroundfetchfailure"
    | "backgroundfetchabort" | "backgroundfetchclick"
)

type BackgroundFetchSuccessOptions= {
    fileCache: FileCache
    origin: string,
    log: (...msgs: any[]) => void
    type: "success" | "abort" | "fail"
}

export const makeBackgroundFetchHandler = (options: BackgroundFetchSuccessOptions) => {
    const {fileCache, origin, log, type: eventType} = options
    return async (
        event: BackgroundFetchHandlerEvent
    ) => {
        const eventName = `[${eventType} bg-fetch]`
        const bgfetch = event.registration
        log(eventName, "registration:", bgfetch)
        if (!bgfetch.recordsAvailable || bgfetch.result !== "success") {
            return
        }
        const targetId = bgfetch.id
        const fetchedResources = await bgfetch.matchAll()
        log(
            eventName,
            "resources downloaded",
            fetchedResources.map(r => r.request.url)
        )
        if (fetchedResources.length < 0) {
            return
        }
        const [downloadIndices, cargoIndices] = await Promise.all([
            getDownloadIndices(origin, fileCache),
            getCargoIndices(origin, fileCache)
        ] as const)
        const downloadIndexPosition = downloadIndices
            .downloads
            .findIndex(({id}) => id === targetId)
        const cargoIndexPosition = cargoIndices
            .cargos
            .findIndex((cargo) => cargo.id === targetId)
        log(
            eventName, 
            `found: cargo=${cargoIndexPosition > -1}, download=${downloadIndexPosition > -1}`
        )
        if (downloadIndexPosition < 0 || cargoIndexPosition < 0) {
            return
        }
        const targetDownloadIndex = downloadIndices.downloads[downloadIndexPosition]
        const {map: urlMap, title: updateTitle, id} = targetDownloadIndex
        const len = fetchedResources.length
        log(eventName, "processing download for pkg", id)
        // I don't want to use too much ram
        // when inserting files, so limit the
        // amount of concurrent files processed
        const maxFileProcessed = 30
        let start = 0
        let end = Math.min(len, maxFileProcessed)
        let resourcesProcessed = 0

        const errorDownloadIndex = {
            ...targetDownloadIndex,
            map: {},
            startedAt: Date.now()
        } as DownloadIndex

        while (start < len) {
            const promises = []
            for (let i = start; i < end; i++) {
                const resource = fetchedResources[i]
                promises.push((async () => {
                    const response = await resource.responseReady
                    const targetUrl = ((url: string) => {
                        if (url.startsWith("https://") || url.startsWith("http://")) {
                            return url
                        }
                        const extension = url.startsWith("/")
                            ? url
                            : "/" + url
                        return `${removeSlashAtEnd(origin)}/${extension}`
                    })(resource.request.url)
                    const targetResource = urlMap[targetUrl]
                    if (!targetResource) {
                        return log(
                            eventName,
                            `orphaned resource found url=${targetUrl}, couldn't map to resource`
                        )
                    }
                    resourcesProcessed++
                    const {storageUrl, bytes, mime} = targetResource
                    if (!response.ok) {
                        // stash for later
                        errorDownloadIndex.map[targetUrl] = {
                            ...targetResource,
                            status: response.status,
                            statusText: (
                                response.statusText || "UNKNOWN STATUS"
                            )
                        }
                        return
                    }
                    const text = await response.text()
                    return fileCache.putFile(
                        storageUrl,
                        new Response(text, {
                            status: 200,
                            statusText: "OK",
                            headers: headers(mime, bytes)
                        })
                    )
                })())
            }
            await Promise.all(promises)
            start += maxFileProcessed
            end = Math.min(len, end + maxFileProcessed)
        }
        log(
            eventName,
            `processed ${resourcesProcessed} out of ${len}. orphan_count=${len - resourcesProcessed}`
        )
        removeDownloadIndex(downloadIndices, targetId)
        updateCargoIndex(cargoIndices, {
            ...cargoIndices.cargos[cargoIndexPosition],
            state: ((event: typeof eventType) => {
                switch (event) {
                    case "abort":
                        return "update-aborted"
                    case "fail":
                        return "update-failed"
                    case "success":
                    default: 
                        return "cached"
                }
            })(eventType)
        })
        await Promise.all([
            saveCargoIndices(cargoIndices, origin, fileCache),
            saveDownloadIndices(downloadIndices, origin, fileCache)
        ] as const)
        if (eventType === "abort" || eventType === "fail") {
            const {storageRootUrl} = targetDownloadIndex
            let targetUrl = storageRootUrl
            if (
                !targetUrl.startsWith("https://") 
                && !targetUrl.startsWith("http://")
            ) {
                const base = removeSlashAtEnd(origin)
                const extension = ((str: string) => {
                    if (str.startsWith("./")) {
                        return str.slice(2)
                    } else if (str.startsWith("/")) {
                        return str.slice(1)
                    } else {
                        return str
                    }
                })(targetUrl)
                targetUrl = `${base}/${extension}`
                log(
                    eventName,
                    `detected storage root url as a relative url - full url is required. Adding origin to url original=${storageRootUrl}, new=${targetUrl}`
                )
            }
            await saveErrorDownloadIndex(
                targetUrl,
                errorDownloadIndex,
                fileCache
            )
            log(eventName, "successfully saved error log")
        }
        log(eventName, "successfully persisted changes")
        // abort event cannot update ui
        if (
            (eventType === "fail" || eventType === "success")
            && event.updateUI
        ) {
            const suffix = eventType === "fail"
                ? "failed"
                : "finished"
            await event.updateUI({
                title: `${updateTitle} ${suffix}!`
            })
        }
    }
}
