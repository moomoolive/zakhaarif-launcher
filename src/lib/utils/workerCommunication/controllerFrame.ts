import {APP_CACHE} from "@/config"
import {wRpc} from "../../wRpc/simple"

export const sandboxToControllerRpc = {
    getFile: async (url: string) => {
        const cache = await caches.open(APP_CACHE)
        const file = await cache.match(url)
        if (!file || !file.body) {
            return null
        }
        const type = file.headers.get("content-type") || "text/plain"
        const length = file.headers.get("content-length") || "0"
        const transfer = {type, length, body: file.body} as const
        return wRpc.transfer(transfer, [file.body])
    }
} as const

export type ControllerFunctions = typeof sandboxToControllerRpc