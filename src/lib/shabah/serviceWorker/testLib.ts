import {
	DownloadClientMessage,
	FileCache,
	BackendMessageChannel,
	DownloadIndex,
	ClientMessageChannel
} from "../backend"
import {
	BackgroundFetchUIEventCore,
	BackgroundFetchResult,
} from "../../types/serviceWorkers"

export const createBgFetchEvent = ({
	id, 
	result = "success", 
	fetchResult = {},
	recordsAvailable = true
}: {
    id: string
    result?: BackgroundFetchResult
    fetchResult?: Record<string, Response>,
    recordsAvailable?: boolean
}) => {
	const output = {
		ui: {
			updateCalled: false,
			state: null as unknown
		},
		finishPromise: Promise.resolve(null as unknown)
	}
	const results = Object.keys(fetchResult).map((url) => {
		return {
			request: new Request(url),
			responseReady: Promise.resolve(fetchResult[url])
		} as const
	})
	return {
		output,
		event: {
			waitUntil: async (p) => { output.finishPromise = p },
			registration: {
				id,
				uploaded: 0,
				uploadTotal: 0,
				downloaded: 0,
				downloadTotal: 0,
				result,
				failureReason: "",
				recordsAvailable,
				abort: async () => true,
				matchAll: async () => results,
				addEventListener: () => {},
				onprogress: () => {}
			},
			updateUI: async (input) => {
				if (output.ui.updateCalled) {
					throw new Error("updateUI already called")
				}
				output.ui.updateCalled = true
				output.ui.state = input
			}
		} as BackgroundFetchUIEventCore
	}
}

export const createDownloadIndex = ({
	id = "pkg", 
	title = "none", 
	name = "",
	bytes = 0, 
	canonicalUrl = "", 
	map = {}, 
	version = "0.1.0",
	resourcesToDelete = [],
	downloadedResources = [],
	canRevertToPreviousVersion = false,
	previousVersion = "none", 
	resolvedUrl = "",
	previousId = ""
} = {}): DownloadIndex => {
	const putIndex = {
		id, 
		previousId,
		title, 
		bytes,
		startedAt: Date.now(),
		segments: [{
			name,
			map, 
			canonicalUrl, 
			version, 
			previousVersion, 
			resolvedUrl,
			bytes,
			resourcesToDelete,
			downloadedResources,
			canRevertToPreviousVersion
		}]
	}
	return putIndex
}

type FileRecord = Record<string, Response>

const createCache = (files: FileRecord): FileCache => {
	return {
		getFile: async (url: string) => files[url],
		putFile: async (url: string, file: Response) => { 
			files[url] = file
			return true
		},
		queryUsage: async () => ({usage: 0, quota: 0}),
		deleteFile: async (url) => {
			delete files[url]
			return true
		},
		deleteAllFiles: async () => {
			files = {}
			return true
		},
		requestPersistence: async () => true,
		isPersisted: async () => true,
		listFiles: async () => {
			return Object.keys(files).map((url) => new Request(url))
		},
	}
}

export const createBgFetchArgs = (initFiles: Record<string, Response>) => {
	const cache = createCache(initFiles)
    
	let backendMessages: Record<string, DownloadIndex> = {}
	const messageConsumer: BackendMessageChannel = {
		getAllMessages: async () => Object.values(backendMessages),
		createMessage: async (message) => {
			backendMessages[message.id] = message
			return true
		},
		getMessage: async (id) => {
			const message = backendMessages[id]
			if (!message) {
				return null
			}
			return message
		},
		deleteMessage: async (id) => {
			delete backendMessages[id]
			return true
		},
		deleteAllMessages: async () => {
			backendMessages = {}
			return true
		}
	}

	let clientMessages: Record<string, DownloadClientMessage> = {}
    
	const clientMessageChannel: ClientMessageChannel = {
		createMessage: async (message) => {
			clientMessages[message.downloadId] = message
			return true
		},
		getAllMessages: async () => {
			return Object.values(clientMessages)
		},
		getMessage: async (id) => {
			const message = clientMessages[id]
			if (!message) {
				return null
			}
			return message
		},
		deleteMessage: async (id) => {
			delete clientMessages[id]
			return true
		},
		deleteAllMessages: async () => {
			clientMessages = {}
			return true
		}
	}

	const virtualFileCache = createCache({})

	return {
		fileCache: cache, 
		internalRecord: initFiles,
		clientMessageChannel,
		messageConsumer,
		virtualFileCache
	}
}