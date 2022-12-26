import type {FetchFunction, FileCache} from "./shared"
import {io} from "../monads/result"

export const webCacheFileCache = (cacheName: string) => {
    return {
        getFile: async (url: string) => {
            const targetCache = await caches.open(cacheName)
            const res = await targetCache.match(url)
            return res || null
        },
        putFile: async (url: string, file: Response) => {
            const targetCache = await caches.open(cacheName)
            targetCache.put(url, file)
            return true
        },
        queryUsage: async () => {
            const {quota = 0, usage = 0} = await navigator.storage.estimate()
            return {quota, usage}
        },
        deleteFile: async (url: string) => {
            const targetCache = await caches.open(cacheName)
            return targetCache.delete(url)
        },
        deleteAllFiles: async () => await caches.delete(cacheName)
    } as FileCache
}

export const webFetch = () => {
    const fetchRetry: FetchFunction = async (input, init) => {
        const res = await io.retry(
            () => fetch(input, init), 
            init.retryCount || 1
        )
        if (res.ok) {
            return res.data
        }
        return new Response(res.msg, {
            status: 400,
            statusText: "BAD REQUEST"
        })
    }
    return fetchRetry
}

import {BackgroundFetchManager} from "../serviceWorkers/handlers"
import {DownloadManager} from "./shared"

type BackgroundFetchExtension = {
    backgroundFetch: BackgroundFetchManager
}

export const webBackgroundFetchDownloadManager = () => {
    const serviceWorkerRegistration = (
        navigator.serviceWorker.ready
    ) as Promise<
        ServiceWorkerRegistration 
        & BackgroundFetchExtension
    >
    return {
        queueDownload: async (id, urls, options) => {
            const sw = await serviceWorkerRegistration
            const registration = await sw.backgroundFetch.fetch(
                id, urls, options
            )
            return registration.result !== "failure"
        },
        getDownloadState: async (id) => {
            const sw = await serviceWorkerRegistration
            const registration = await sw.backgroundFetch.get(id)
            if (!registration) {
                return null
            }
            const {
                downloaded, downloadTotal, result,
                failureReason
            } = registration
            return {
                id,
                downloaded,
                total: downloadTotal,
                failed: result === "failure",
                finished: result === "success",
                failureReason
            }
        },
        cancelDownload: async (id) => {
            const sw = await serviceWorkerRegistration
            const registration = await sw.backgroundFetch.get(id)
            if (!registration) {
                return false
            }
            return await registration.abort()
        },
        currentDownloadIds: async () => {
            const sw = await serviceWorkerRegistration
            return sw.backgroundFetch.getIds()
        }
    } as DownloadManager
}