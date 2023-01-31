import type {
    BackgroundFetchManager
} from "../../../../lib/types/serviceWorkers"
import type {DownloadManager} from "../../backend"

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
    const manager: DownloadManager = {
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
    }
    return manager
}