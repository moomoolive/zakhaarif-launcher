import {
    getDownloadIndices,
    removeDownloadIndex,
    saveDownloadIndices,
    getCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
    FileCache,
    removeSlashAtEnd,
    DownloadIndex,
    saveErrorDownloadIndex,
    NO_UPDATE_QUEUED,
    DownloadSegment,
    CargoState
} from "../backend"
import {BackgroundFetchEvent, UpdateUIMethod} from "../../../lib/types/serviceWorkers"

export type BackgroundFetchEventName = "success" | "abort" | "fail"

export type ProgressUpdateRecord = {
    type: BackgroundFetchEventName | "install"
    downloadId: string
    canonicalUrls: string[]
}

export type BackgroundFetchSuccessOptions = {
    fileCache: FileCache
    origin: string,
    log: (...msgs: any[]) => void
    type: BackgroundFetchEventName
    onProgress?: (progressUpdate: ProgressUpdateRecord) => unknown
}

export type BackgroundFetchHandlerEvent = BackgroundFetchEvent & {
    updateUI?: UpdateUIMethod
}

export const makeBackgroundFetchHandler = (options: BackgroundFetchSuccessOptions) => {
    const {
        fileCache, 
        origin, 
        log, 
        type: eventType, 
        onProgress = () => {}
    } = options
    const eventName = `[🐕‍🦺 bg-fetch ${eventType}]`
    return async (
        event: BackgroundFetchHandlerEvent
    ) => {
        const bgfetch = event.registration
        log(eventName, "registration:", bgfetch)
        const downloadQueueId = bgfetch.id
        const [downloadIndices, cargoIndices] = await Promise.all([
            getDownloadIndices(origin, fileCache),
            getCargoIndices(origin, fileCache)
        ] as const)
        const downloadIndexPosition = downloadIndices.downloads.findIndex(
            (index) => index.id === downloadQueueId
        )
        log(eventName, `found download_index=${downloadIndexPosition > -1}`)
        if (downloadIndexPosition < 0) {
            log(
                eventName,
                `Background fetch does not exist in records (id=${downloadQueueId}). Ignoring handler!`
            )
            return
        }
        const targetDownloadIndex = downloadIndices.downloads[downloadIndexPosition]
        const downloadSegmentsLength = targetDownloadIndex.segments.length
        
        const fetchedResources = await bgfetch.matchAll()
        log(
            eventName,
            "resources downloaded",
            fetchedResources.map(
                (resource) => resource.request.url
            )
        )
        
        const associatedCargos = cargoIndices.cargos.filter(
            (cargo) => cargo.downloadQueueId === downloadQueueId
        )
        log(
            eventName, 
            `download_segments=${downloadSegmentsLength}, associated_cargos=${associatedCargos.length}`
        )

        const allAssociatedCargosAreInSegments = associatedCargos.every((cargo) => {
            const {canonicalUrl} = cargo
            const found = targetDownloadIndex.segments.find(
                (segment) => segment.canonicalUrl === canonicalUrl
            )
            return !!found
        })

        if (!allAssociatedCargosAreInSegments) {
            log(
                eventName,
                `Some of associated cargos were not found in download index segment!`,
                associatedCargos,
                targetDownloadIndex.segments,
            )
        }

        const progressUpdater: ProgressUpdateRecord = {
            type: "install",
            downloadId: targetDownloadIndex.id,
            canonicalUrls: targetDownloadIndex.segments.map(
                (segment) => segment.canonicalUrl
            )
        }
        if (eventType === "success") {
            onProgress(progressUpdater)
        }

        const updateTitle = targetDownloadIndex.title
        let totalResources = fetchedResources.length
        let resourcesProcessed = 0
        let failCount = 0
        const orphanedResources = new Map<string, boolean>()
        for (const cargoIndex of associatedCargos) {
            const {canonicalUrl} = cargoIndex
            const targetSegmentIndex = targetDownloadIndex.segments.findIndex(
                (segment) => segment.canonicalUrl === canonicalUrl
            )
            if (targetSegmentIndex < 0) {
                log(
                    eventName,
                    `download segment "${canonicalUrl}" does not exist on download index ${downloadQueueId}`
                )
                continue
            }
            const targetSegment = targetDownloadIndex.segments[targetSegmentIndex]
            const {map: urlMap} = targetSegment
            const len = fetchedResources.length
            log(eventName, `processing download for cargo "${canonicalUrl}"`)
            // Don't want to use too much RAM
            // when inserting files, so limit the
            // amount of concurrent files processed
            const maxFileProcessed = 30
            let start = 0
            let end = Math.min(len, maxFileProcessed)
            const processingStats = {
                resourcesProcessed: 0,
                failedResources: 0
            }

            const errorDownloadSegment: DownloadSegment = {
                map: {},
                bytes: 0,
                version: targetSegment.version,
                previousVersion: targetSegment.previousVersion,
                canonicalUrl: targetSegment.canonicalUrl,
                resolvedUrl: targetSegment.resolvedUrl,
                resourcesToDelete: targetSegment.resourcesToDelete
            }
            const errorDownloadIndex: DownloadIndex = {
                // once download client attempts to
                // retry this segment, and valid id
                // will be provisioned
                id: "err",
                previousId: targetDownloadIndex.id,
                segments: [errorDownloadSegment],
                title: `Failed ${updateTitle} (${cargoIndex.name})`,
                bytes: 0,
                startedAt: Date.now()
            }

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
                            const previousValue = orphanedResources.get(targetUrl)
                            if (
                                typeof previousValue === "undefined" 
                                || previousValue
                            ) {
                                orphanedResources.set(targetUrl, true)
                            }
                            return
                        }

                        orphanedResources.set(targetUrl, false)
                        processingStats.resourcesProcessed++
                        const {bytes} = targetResource
                        if (response.ok) {
                            return fileCache.putFile(
                                resource.request.url,
                                response
                            )
                        }

                        // stash for later for retry
                        errorDownloadSegment.map[targetUrl] = {
                            ...targetResource,
                            status: response.status,
                            statusText: (
                                response.statusText || "UNKNOWN STATUS"
                            )
                        }
                        processingStats.failedResources++
                        errorDownloadSegment.bytes += bytes
                        errorDownloadIndex.bytes += bytes
                    })())
                }
                await Promise.all(promises)
                resourcesProcessed += processingStats.resourcesProcessed
                failCount += processingStats.failedResources
                start += maxFileProcessed
                end = Math.min(len, end + maxFileProcessed)
            }
            let state: CargoState = "cached"
            const resourcesFailed = processingStats.failedResources > 0
            if (eventType === "abort" && resourcesFailed) {
                state = "update-aborted"
            }
            if (eventType === "fail" && resourcesFailed) {
                state = "update-failed"
            }
            log(
                eventName, 
                `saving cargo ${cargoIndex.name} with state "${state}"`
            )
            updateCargoIndex(cargoIndices, {
                ...cargoIndex,
                state,
                downloadQueueId: NO_UPDATE_QUEUED
            })
            
            const isErrorEvent = (
                eventType === "abort" 
                || eventType === "fail"
            )
            
            if (!isErrorEvent || !resourcesFailed) {
                continue
            }

            const originalUrl = cargoIndex.resolvedUrl
            let targetUrl = originalUrl
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
                    `detected storage root url as a relative url - full url is required. Adding origin to url original=${originalUrl}, new=${targetUrl}`
                )
            }
            await saveErrorDownloadIndex(
                targetUrl,
                errorDownloadIndex,
                fileCache
            )
            log(eventName, "successfully saved error log")
        }

        orphanedResources.forEach((value, key) => {
            if (!value) {
                return
            }
            const targetUrl = key
            log(
                eventName,
                `Orphaned resource found. url=${targetUrl}, couldn't map to resource.`
            )
        })
        
        const orphanCount = totalResources - resourcesProcessed
        log(
            eventName,
            `processed ${resourcesProcessed} out of ${totalResources}. orphan_count=${orphanCount}, fail_count=${failCount}.${orphanCount > 0 ? " Releasing orphans!" : ""}`
        )
        
        await saveCargoIndices(cargoIndices, origin, fileCache)
        removeDownloadIndex(downloadIndices, downloadQueueId)
        await saveDownloadIndices(downloadIndices, origin, fileCache)
        log(eventName, "successfully persisted changes")
        // "abort" does not have update-ui
        // https://developer.chrome.com/blog/background-fetch/#service-worker-events
        const eventHasUiUpdate = (
            eventType === "fail" 
            || eventType === "success"
        )

        if (eventHasUiUpdate && event.updateUI) {
            const suffix = eventType === "fail"
                ? "failed"
                : "finished"
            await event.updateUI({title: `${updateTitle} ${suffix}!`})
        }

        onProgress({...progressUpdater, type: eventType})
    }
}
