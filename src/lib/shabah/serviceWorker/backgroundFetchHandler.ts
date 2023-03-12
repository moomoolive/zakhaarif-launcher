import {
	FileCache,
	BackendMessageChannel,
	ClientMessageChannel
} from "../backend"
import {BackgroundFetchEvent, UpdateUIMethod} from "../../../lib/types/serviceWorkers"
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
    log: (...msgs: unknown[]) => void
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
		const totalResources = fetchedResources.length

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
