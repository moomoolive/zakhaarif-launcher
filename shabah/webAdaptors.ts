import type {FetchFunction, FileCache} from "./shared"
import {io} from "../monads/result"

export const webCacheFileCache = (cacheName: string) => {
    const targetCache = caches.open(cacheName)
    return {
        getFile: async (url: string) => {
            return (await targetCache).match(url)
        },
        putFile: async (url: string, file: Response) => {
            (await targetCache).put(url, file)
            return true
        },
        queryUsage: async () => {
            const {quota = 0, usage = 0} = await navigator.storage.estimate()
            return {quota, usage}
        },
        deleteFile: async (url: string) => {
            (await targetCache).delete(url)
            return true
        }
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
    const emptyFn = () => {}
    return {
        queueDownload: async (id, urls, options) => {
            const sw = await serviceWorkerRegistration
            const registration = await sw.backgroundFetch.fetch(
                id, urls, options
            )
            return registration.result !== "failure"
        },
        addProgressListener: async (id, callback) => {
            const sw = await serviceWorkerRegistration
            const registration = await sw.backgroundFetch.get(id)
            if (!registration) {
                return false
            }
            registration.addEventListener("progress", () => {
                callback({
                    id,
                    downloaded: registration.downloaded,
                    total: registration.downloadTotal,
                    failed: registration.result === "failure",
                    finished: registration.result === "success",
                    failureReason: registration.failureReason
                })
            })
            return true
        },
        removeProgressListener: async (id) => {
            const sw = await serviceWorkerRegistration
            const registration = await sw.backgroundFetch.get(id)
            if (!registration) {
                return false
            }
            // how do actually stop the listener
            // doesn't seem to be anything in the spec
            registration.addEventListener("progress", emptyFn)
            return true
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
        currentDownloads: async () => {
            const sw = await serviceWorkerRegistration
            return sw.backgroundFetch.getIds()
        }
    } as DownloadManager
}