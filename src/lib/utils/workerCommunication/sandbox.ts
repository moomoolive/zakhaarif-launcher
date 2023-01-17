import {APP_CACHE} from "@/config"
import {wRpc} from "@/lib/wRpc/simple"

const emptyTransfer = [] as Transferable[]

export const sandboxToControllerFrameRpc = {
    getFile: async (url: string) => {
        const cache = await caches.open(APP_CACHE)
        const file = await cache.match(url)
        if (!file) {
            return null
        }
        const payload = {
            headers: {
                type: file.headers.get("content-type") || "text/plain",
                length: file.headers.get("content-length") || "0"
            },
            body: file.body
        } as const
        return wRpc.transfer(
            payload, 
            !file.body ? emptyTransfer : [file.body]
        )
    }
} as const

export const serviceWorkerToSandboxRpc = {
    getFile: (url: string) => {
        console.info("service worker requesting cache url", url)
        console.log("res", {
            headers: {
                "content-type": "application/json",
                "content-length": "100"
            },
            body: ""
        })
        return
    }
} as const

export type ServiceWorkerToSandboxRpc = typeof serviceWorkerToSandboxRpc