import type {FetchFunction} from "./shared"
import {io} from "../monads/result"

export const webCacheFileCache = (cacheName: string) => {
    const targetCache = caches.open(cacheName)
    return {
        getFile: async (url: string) => {
            return (await targetCache).match(url)
        },
        putFile: async (url: string, file: Response) => {
            return (await targetCache).put(url, file)
        },
        queryUsage: async () => {
            const {quota = 0, usage = 0} = await navigator.storage.estimate()
            return {quota, usage}
        }
    }
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