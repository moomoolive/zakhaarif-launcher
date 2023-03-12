import type {FileCache} from "../../backend"

export const webCacheFileCache = (cacheName: string) => {
	const cache: FileCache =  {
		getFile: async (url: string) => {
			const targetCache = await caches.open(cacheName)
			const res = await targetCache.match(url)
			return res || null
		},
		putFile: async (url: string, file: Response) => {
			const targetCache = await caches.open(cacheName)
			await targetCache.put(url, file)
			return true
		},
		deleteFile: async (url: string) => {
			const targetCache = await caches.open(cacheName)
			return targetCache.delete(url)
		},
		listFiles: async () => {
			const targetCache = await caches.open(cacheName)
			return await targetCache.keys()
		},
		deleteAllFiles: async () => await caches.delete(cacheName),
		queryUsage: async () => {
			if (!("estimate" in navigator.storage)) {
				// as of writing this safari (desktop & ios)
				// don't show developers how much storage they
				// can use. However it seems that safari generally
				// allows some thing like 1GB for every web-app
				// reference: https://web.dev/storage-for-the-web/#how-much
				const oneGigabyte = 1_000_000_000
				return {quota: oneGigabyte, usage: 0}
			}
			const {quota = 0, usage = 0} = await navigator.storage.estimate()
			return {quota, usage}
		},
		isPersisted: async () => await navigator.storage.persisted(),
		requestPersistence: async () => await (navigator.storage as unknown as { persist: () => Promise<boolean> }).persist(),
	}
	return cache
}
