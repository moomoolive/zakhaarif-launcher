import {
    getDownloadIndices,
    removeDownloadIndex,
    saveDownloadIndices,
    getCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    FileCache,
    headers,
    appendShabahHeaders,
    removeSlashAtEnd,
    DownloadIndex,
    saveErrorDownloadIndex,
} from "../backend"
import {BackgroundFetchEvent, UpdateUIMethod} from "@/lib/types/serviceWorkers"

type BackgroundFetchSuccessOptions= {
    fileCache: FileCache
    origin: string,
    log: (...msgs: any[]) => void
    type: "success" | "abort" | "fail"
}

export type BackgroundFetchHandlerEvent = BackgroundFetchEvent & {
    updateUI?: UpdateUIMethod
}

export const makeBackgroundFetchHandler = (options: BackgroundFetchSuccessOptions) => {
    const {fileCache, origin, log, type: eventType} = options
    return async (
        event: BackgroundFetchHandlerEvent
    ) => {
        const eventName = `[🐕‍🦺 bg-fetch ${eventType}]`
        const bgfetch = event.registration
        log(eventName, "registration:", bgfetch)
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
        let failedResources = 0

        const errorDownloadIndex = {
            ...targetDownloadIndex,
            map: {},
            bytes: 0,
            startedAt: Date.now()
        } as DownloadIndex

        while (start < len) {
            const promises = [] as Array<Promise<unknown>>
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
                        failedResources++
                        errorDownloadIndex.bytes += bytes
                        return
                    }
                    return fileCache.putFile(
                        resource.request.url,
                        response
                    )
                })())
            }
            await Promise.all(promises)
            start += maxFileProcessed
            end = Math.min(len, end + maxFileProcessed)
        }
        log(
            eventName,
            `processed ${resourcesProcessed} out of ${len}. orphan_count=${len - resourcesProcessed}, fail_count=${failedResources}`
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
            const {resolvedUrl} = targetDownloadIndex
            let targetUrl = resolvedUrl
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
                    `detected storage root url as a relative url - full url is required. Adding origin to url original=${resolvedUrl}, new=${targetUrl}`
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
