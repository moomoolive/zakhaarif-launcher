import {
    FileCache,
    removeSlashAtEnd,
    DownloadIndex,
    saveErrorDownloadIndex,
    DownloadSegment,
    ManifestState,
    CACHED,
    ABORTED,
    FAILED,
    DownloadClientMessage,
    BackendMessageChannel,
    ClientMessageChannel
} from "../backend"
import {BackgroundFetchEvent, UpdateUIMethod} from "../../../lib/types/serviceWorkers"
import { isZipFile } from "../../utils/urls/removeZipExtension"
import { decompressFile } from "./decompression"
import type {DecompressionStreamConstructor} from "../../types/streams"
import {InstallEventName, installCore} from "./installCore"

export type BackgroundFetchEventName = InstallEventName

export type ProgressUpdateRecord = {
    type: BackgroundFetchEventName | "install"
    downloadId: string
    canonicalUrls: string[]
}

export type BackgroundFetchSuccessOptions = {
    fileCache: FileCache
    virtualFileCache: FileCache
    backendMessageChannel: BackendMessageChannel
    origin: string,
    log: (...msgs: any[]) => void
    type: BackgroundFetchEventName
    onProgress?: (progressUpdate: ProgressUpdateRecord) => unknown
    clientMessageChannel: ClientMessageChannel
    decompressionConstructor?: DecompressionStreamConstructor
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
        onProgress = () => {},
        clientMessageChannel,
        backendMessageChannel,
        virtualFileCache,
        decompressionConstructor
    } = options
    const eventName = `[🐕‍🦺 bg-fetch ${eventType}]`
    return async (
        event: BackgroundFetchHandlerEvent
    ) => {
        const bgfetch = event.registration
        log(eventName, "registration:", bgfetch)
        const downloadQueueId = bgfetch.id
        const targetDownloadIndex = await backendMessageChannel.getMessage(downloadQueueId)
        log(eventName, `found download_index=${!!targetDownloadIndex}`)
        if (!targetDownloadIndex) {
            log(eventName, `Background fetch does not exist in records (id=${downloadQueueId}). Ignoring handler!`)
            return
        }
        const fetchedResources = await bgfetch.matchAll()
        log(
            eventName,
            "resources downloaded",
            fetchedResources.map((resource) => resource.request.url)
        )

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

        const installResponse = await installCore({
            eventName,
            eventType,
            fileCache,
            virtualFileCache,
            fetchedResources,
            downloadIndex: targetDownloadIndex,
            downloadQueueId,
            decompressionConstructor,
            log,
            origin
        })

        const {
            resourcesProcessed, 
            failCount,
            orphanedResources,
            downloadClientMessage
        } = installResponse

        /*
        let resourcesProcessed = 0
        let failCount = 0
        const orphanedResources = new Map<string, boolean>()
        
        const downloadClientMessage: DownloadClientMessage = {
            id: downloadQueueId,
            timestamp: Date.now(),
            downloadId: downloadQueueId,
            stateUpdates: []
        }
        for (const downloadSegement of targetDownloadIndex.segments) {
            const {canonicalUrl} = downloadSegement
            
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
                name: targetSegment.name,
                bytes: 0,
                version: targetSegment.version,
                previousVersion: targetSegment.previousVersion,
                canonicalUrl: targetSegment.canonicalUrl,
                resolvedUrl: targetSegment.resolvedUrl,
                resourcesToDelete: targetSegment.resourcesToDelete,
                downloadedResources: [],
                canRevertToPreviousVersion: targetSegment.canRevertToPreviousVersion
            }
            const errorDownloadIndex: DownloadIndex = {
                // once download client attempts to
                // retry this segment, and valid id
                // will be provisioned
                id: "err",
                previousId: targetDownloadIndex.id,
                segments: [errorDownloadSegment],
                title: `Failed ${canonicalUrl}`,
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
                        errorDownloadSegment.downloadedResources.push(targetUrl)
                        processingStats.resourcesProcessed++
                        const {bytes, mime, storageUrl} = targetResource
                        if (response.ok) {
                            const contentType = isZipFile(resource.request.url)
                                ? mime
                                : response.headers.get("content-type") || mime
                            const config = {
                                status: response.status,
                                statusText: response.statusText,
                                // most headers are more or less
                                // useless when file is cached, 
                                // so we'll discard most of them 
                                // to save disk space
                                headers: {
                                    "Content-Length": bytes.toString(),
                                    "Content-Type": contentType
                                }
                            }
                            if (
                                !decompressionConstructor
                                || !isZipFile(resource.request.url) 
                                || !response.body
                            ) {
                                return fileCache.putFile(
                                    storageUrl,
                                    new Response(response.body, config)
                                )
                            }
                            log(eventName, `${resource.request.url} is a zip file, will be mapped to ${storageUrl} after transform. Decompressing now...`)
                            const transformedBodyBytes = await decompressFile(
                                resource.request.url, 
                                response,
                                decompressionConstructor
                            )
                            config.headers["Content-Length"] = transformedBodyBytes.byteLength.toString()
                            return fileCache.putFile(
                                storageUrl,
                                new Response(transformedBodyBytes, config)
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
            let state: ManifestState = CACHED
            const resourcesFailed = processingStats.failedResources > 0
            if (eventType === "abort" && resourcesFailed) {
                state = ABORTED
            }
            if (eventType === "fail" && resourcesFailed) {
                state = FAILED
            }
            log(
                eventName, 
                `saving cargo "${canonicalUrl}" with state "${state}"`
            )

            downloadClientMessage.stateUpdates.push({
                canonicalUrl,
                state
            })
            
            const isErrorEvent = (
                eventType === "abort" 
                || eventType === "fail"
            )
            
            if (!isErrorEvent || !resourcesFailed) {
                continue
            }

            const originalUrl = downloadSegement.resolvedUrl
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
                virtualFileCache
            )
            log(eventName, "successfully saved error log")
        }
        */

        await clientMessageChannel.createMessage(downloadClientMessage)

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
        
        await backendMessageChannel.deleteMessage(downloadQueueId)

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
