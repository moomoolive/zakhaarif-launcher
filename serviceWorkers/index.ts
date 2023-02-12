import {APP_CACHE, DOWNLOAD_CLIENT_QUEUE} from "../src/config"
import type {
    BackgroundFetchEventHandlerSetters
} from "../src/lib/types/serviceWorkers"
import { 
    makeBackgroundFetchHandler,
    ProgressUpdateRecord
} from "../src/lib/shabah/serviceWorker/backgroundFetchHandler"
import {makeFetchHandler} from "../src/lib/shabah/serviceWorker/fetchHandler"
import {webCacheFileCache} from "../src/lib/shabah/adaptors/fileCache/webCache"
import {GlobalConfig, createServiceWorkerRpcs} from "./rpcs"
import {wRpc} from "../src/lib/wRpc/simple"
import type {AppRpcs} from "../src/lib/utils/appRpc"
import { DownloadClientMessage, downloadClientMessageUrl } from "../src/lib/shabah/backend"

const sw = globalThis.self as unknown as (
    ServiceWorkerGlobalScope & BackgroundFetchEventHandlerSetters
)

const CONFIG_URL =  `${sw.location.origin}/__sw-config__.json`

let config: GlobalConfig = {
    version: 1,
    log: true,
    updatedAt: -1,
    createdAt: Date.now()
}

caches.open(APP_CACHE).then(async (cache) => {
    const file = await cache.match(CONFIG_URL)
    if (!file) {
        return persistConfig(config)
    }
    const parsed = await file.json() as Partial<typeof config>
    config = {...config, ...parsed}
})

const persistConfig = async (config: GlobalConfig) => {
    const cache = await caches.open(APP_CACHE)
    config.updatedAt = Date.now()
    await cache.put(
        CONFIG_URL, 
        new Response(JSON.stringify(config), {status: 200})
    )
    return true
}

sw.oninstall = (event) => event.waitUntil(sw.skipWaiting())

sw.onactivate = (event) => {
    event.waitUntil((async () => {
        await sw.clients.claim()
        console.info("[📥 install] new service-worker installed")
        console.info(`[🔥 activate] new sevice worker in control, started with config`, config)
    })())
}

const fileCache = webCacheFileCache(APP_CACHE)

const fetchHandler = makeFetchHandler({
    fileCache, 
    origin: sw.location.origin,
    fetchFile: fetch,
    log: console.info,
    config
})

sw.onfetch = (event) => event.respondWith(fetchHandler(event))

const logger = (...msgs: any[]) => {
    if (config.log) {
        console.info(...msgs)
    }
}

const rpc = new wRpc<AppRpcs>({
    responses: createServiceWorkerRpcs({
        configRef: config,
        persistConfig,
    }),
    messageInterceptor: {
        addEventListener: (_, handler) => {
            sw.onmessage = (event) => event.waitUntil(handler(event))
        }
    },
    messageTarget: {
        postMessage: async (data, transferables) => {
            const clients = await sw.clients.matchAll()
            for (const client of clients) {
                client.postMessage(data, transferables)
            }
        }
    }
})

const notifyDownloadProgress = async (update: ProgressUpdateRecord) => {
    rpc.execute("notifyDownloadProgress", update)
}

const messageDownloadClient = async (message: DownloadClientMessage) => {
    const targetCache = await caches.open(DOWNLOAD_CLIENT_QUEUE)
    await targetCache.put(
        downloadClientMessageUrl(message),
        new Response(JSON.stringify(message), {status: 200, statusText: "OK"})
    )
    return true
}

const bgFetchSuccessHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "success",
    onProgress: notifyDownloadProgress,
    messageDownloadClient
})

sw.onbackgroundfetchsuccess = (event) => event.waitUntil(bgFetchSuccessHandle(event))

sw.onbackgroundfetchclick = () => sw.clients.openWindow("/")

const bgFetchAbortHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "abort",
    onProgress: notifyDownloadProgress,
    messageDownloadClient
})

sw.onbackgroundfetchabort = (event) => event.waitUntil(bgFetchAbortHandle(event))

const bgFetchFailHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "fail",
    onProgress: notifyDownloadProgress,
    messageDownloadClient
})

sw.onbackgroundfetchfail = (event) => event.waitUntil(bgFetchFailHandle(event))
