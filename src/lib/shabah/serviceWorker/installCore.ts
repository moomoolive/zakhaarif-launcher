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
} from "../backend"
import {
    BackgroundFetchRecord
} from "../../../lib/types/serviceWorkers"
import { isZipFile } from "../../utils/urls/removeZipExtension"
import { decompressFile } from "./decompression"
import type {DecompressionStreamConstructor} from "../../types/streams"

export type InstallEventName = "success" | "abort" | "fail"

export type InstallConfig = {
    downloadIndex: DownloadIndex
    log: (...args: unknown[]) => unknown
    fetchedResources: BackgroundFetchRecord[]
    fileCache: FileCache
    virtualFileCache: FileCache
    eventName: string
    downloadQueueId: string
    decompressionConstructor?: DecompressionStreamConstructor,
    eventType: InstallEventName
    origin: string
}

export type InstallResult = {
    orphanedResources: Map<string, boolean>
    resourcesProcessed: number
    failCount: number
    downloadClientMessage: DownloadClientMessage
}

export async function installCore(config: InstallConfig): Promise<InstallResult> {
    const {
        downloadIndex, 
        log, 
        fetchedResources, 
        fileCache, 
        virtualFileCache,
        eventName,
        downloadQueueId,
        decompressionConstructor,
        eventType,
        origin
    } = config

    const orphanedResources = new Map<string, boolean>()
    let resourcesProcessed = 0
    let failCount = 0
    
    const downloadClientMessage: DownloadClientMessage = {
        id: downloadQueueId,
        timestamp: Date.now(),
        downloadId: downloadQueueId,
        stateUpdates: []
    }

    for (const downloadSegement of downloadIndex.segments) {
        const {canonicalUrl} = downloadSegement
        
        const targetSegmentIndex = downloadIndex.segments.findIndex(
            (segment) => segment.canonicalUrl === canonicalUrl
        )
        if (targetSegmentIndex < 0) {
            log(
                eventName,
                `download segment "${canonicalUrl}" does not exist on download index ${downloadQueueId}`
            )
            continue
        }
        const targetSegment = downloadIndex.segments[targetSegmentIndex]
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
            previousId: downloadIndex.id,
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
    return {
        orphanedResources,
        resourcesProcessed,
        failCount,
        downloadClientMessage
    }
}