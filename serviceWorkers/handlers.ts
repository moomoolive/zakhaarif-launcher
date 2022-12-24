export type FetchHandlerEvent = {
    respondWith: (r: Response | PromiseLike<Response>) => void
    request: Request
}

export type CacheImplementation = {
    match: (url: RequestInfo | URL, options?: CacheQueryOptions) => Promise<Response | void>
}

export type FetchOptions = {
    rootDoc: string,
    cache: Promise<CacheImplementation>
    fetchFile: typeof fetch
}

export const makeFetchHandler = (options: FetchOptions) => {
    const {rootDoc, cache, fetchFile} = options
    return async (event: FetchHandlerEvent) => {
        if (event.request.url !== rootDoc) {
            const cached = await (await cache).match(event.request)
            if (cached && cached.ok) {
                return event.respondWith(cached)
            }
            return
        }
        try {
            const res = await fetchFile(event.request)
            return event.respondWith(res)
        } catch (err) {
            const cached = await (await cache).match(event.request)
            if (cached && cached.ok) {
                return event.respondWith(cached)
            }
            return event.respondWith(new Response("", {
                status: 500,
                statusText: "Internal Server Error",
                headers: {"Sw-Net-Err": String(err) || "1"}
            }))
        }
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

export type BackgroundFetchUIEventCore = {
    waitUntil: (promise: Promise<any>) => any
    readonly registration: BackgroundFetchRegistration
    updateUI: (options: BackgroundFetchUpdateUIOptions) => Promise<void>
}

export type BackgroundFetchEvents = (
    "backgroundfetchsuccess" | "backgroundfetchfailure"
    | "backgroundfetchabort" | "backgroundfetchclick"
)

import {
    getDownloadIndices,
    removeDownloadIndex,
    saveDownloadIndices,
    getCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    FileCache,
    headers,
} from "../shabah/shared"

type BackgroundFetchSuccessOptions= {
    fileCache: FileCache
    origin: string
}

export const makeBackgroundFetchSuccessHandler = (options: BackgroundFetchSuccessOptions) => {
    const {fileCache, origin} = options
    return (event: BackgroundFetchUIEventCore) => {
        event.waitUntil((async () => {
                const bgfetch = event.registration
            if (
                !bgfetch.recordsAvailable
                || bgfetch.result !== "success"
            ) {
                return
            }
            const targetId = bgfetch.id
            const fetchedResources = await bgfetch.matchAll()
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
            if (
                downloadIndexPosition < 0
                || cargoIndexPosition < 0
            ) {
                return
            }
            const {map: urlMap, title: updateTitle} = downloadIndices.downloads[downloadIndexPosition]
            const len = fetchedResources.length
            // I don't want to use too much ram
            // when inserting files, so limit the
            // amount of concurrent files processed
            const maxFileProcessed = 30
            let start = 0
            let end = Math.min(len, maxFileProcessed)

            while (start < len) {
                const promises = []
                for (let i = start; i < end; i++) {
                    const resource = fetchedResources[i]
                    promises.push((async () => {
                        const response = await resource.responseReady
                        const targetUrl = resource.request.url
                        const targetResource = urlMap[targetUrl]
                        if (!targetResource) {
                            return
                        }
                        const {storageUrl, bytes, mime} = targetResource
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
            removeDownloadIndex(downloadIndices, targetId)
            const saveDownloadPromise = saveDownloadIndices(downloadIndices, origin, fileCache)
            updateCargoIndex(cargoIndices, {
                ...cargoIndices.cargos[cargoIndexPosition],
                state: "cached"
            })
            await Promise.all([
                saveCargoIndices(cargoIndices, origin, fileCache),
                saveDownloadPromise
            ] as const)
            await event.updateUI({title: `${updateTitle} Finished!`})
        })())
    }
}