import {
    APP_CACHE, 
    DOWNLOAD_CLIENT_CHANNEL_NAME, 
    BACKEND_CHANNEL_NAME,
    VIRTUAL_FILE_CACHE
} from "../src/config"
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
import {createBackendChannel, createClientChannel} from "../src/lib/utils/shabahChannels"
import type {CompressionStreams} from "../src/lib/types/streams"

const sw = globalThis.self as unknown as (
    ServiceWorkerGlobalScope 
    & BackgroundFetchEventHandlerSetters
    & CompressionStreams
)

if (typeof sw.DecompressionStream === "undefined") {
    console.warn("decompression streams are not supported")
}

const CONFIG_URL =  `${sw.location.origin}/__sw-config__.json`

let config: GlobalConfig = {
    version: 1,
    log: sw.location.origin.includes("http://localhost:5173"),
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

const rpc = new wRpc<AppRpcs, GlobalConfig>({
    state: config,
    responses: createServiceWorkerRpcs({persistConfig}),
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

const virtualFileCache = webCacheFileCache(VIRTUAL_FILE_CACHE)
const clientMessageChannel = createClientChannel(DOWNLOAD_CLIENT_CHANNEL_NAME)
const backendMessageChannel = createBackendChannel(BACKEND_CHANNEL_NAME)

const bgFetchDependencies = {
    virtualFileCache,
    clientMessageChannel,
    backendMessageChannel,
    onProgress: notifyDownloadProgress,
    log: logger,
    origin: sw.location.origin,
    fileCache,
    decompressionConstructor: sw.DecompressionStream
} as const

const bgFetchSuccessHandle = makeBackgroundFetchHandler({
    ...bgFetchDependencies,
    type: "success",
})

sw.onbackgroundfetchsuccess = (event) => event.waitUntil(bgFetchSuccessHandle(event))

sw.onbackgroundfetchclick = () => sw.clients.openWindow("/")

const bgFetchAbortHandle = makeBackgroundFetchHandler({
    ...bgFetchDependencies,
    type: "abort",
})

sw.onbackgroundfetchabort = (event) => event.waitUntil(bgFetchAbortHandle(event))

const bgFetchFailHandle = makeBackgroundFetchHandler({
    ...bgFetchDependencies,
    type: "fail",
})

sw.onbackgroundfetchfail = (event) => event.waitUntil(bgFetchFailHandle(event))
