import {APP_CACHE} from "../src/config"
import type {
    InboundMessageAction, 
    InboundMessage,
    BackgroundFetchEventHandlerSetters
} from "../src/lib/types/serviceWorkers"
import { 
    makeBackgroundFetchHandler
} from "../src/lib/shabah/serviceWorker/backgroundFetchHandler"
import {
    makeFetchHandler, 
} from "../src/lib/shabah/serviceWorker/fetchHandler"
import {
    webCacheFileCache
} from "../src/lib/shabah/adaptors/fileCache/webCache"

const sw = globalThis.self as unknown as (
    ServiceWorkerGlobalScope & BackgroundFetchEventHandlerSetters
)

const CONFIG_URL =  `${sw.location.origin}/__sw-config__.json`

let config = {
    version: 1,
    log: true,
    updatedAt: -1,
    createdAt: Date.now()
}

caches.open(APP_CACHE).then(async (cache) => {
    const file = await cache.match(CONFIG_URL)
    if (!file) {
        return persistConfig()
    }
    const parsed = await file.json() as Partial<typeof config>
    config = {...config, ...parsed}
})

const persistConfig = async () => {
    const cache = await caches.open(APP_CACHE)
    config.updatedAt = Date.now()
    return cache.put(
        CONFIG_URL, 
        new Response(JSON.stringify(config), {status: 200})
    )
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

const logger = (...msgs: any[]) => {
    if (config.log) {
        console.info(...msgs)
    }
}

const fetchHandler = makeFetchHandler({
    fileCache, 
    origin: sw.location.origin,
    fetchFile: fetch,
    log: logger
})

sw.onfetch = (event) => event.respondWith(fetchHandler(event))

const bgFetchSuccessHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "success"
})

sw.onbackgroundfetchsuccess = (event) => event.waitUntil(bgFetchSuccessHandle(event))

sw.onbackgroundfetchclick = () => sw.clients.openWindow("/")

const bgFetchAbortHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "abort"
})

sw.onbackgroundfetchabort = (event) => event.waitUntil(bgFetchAbortHandle(event))

const bgFetchFailHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "fail"
})

sw.onbackgroundfetchfail = (event) => event.waitUntil(bgFetchFailHandle(event))

const swAction = {
    "config:silent_logs": () => {
        config.log = false
    },
    "config:verbose_logs": () => {
        config.log = true
    },
    "list:connected_clients": async (id: string) => {
        const clients = await sw.clients.matchAll()
        console.info(
            `connected clients (${clients.length}): ${clients.map((c) => {
                return `(id=${c.id || "unknown"}, url=${c.url}, type=${c.type})\n`
            }).join(",")}`,
        )
    },
    "list:config": (id: string) => {
        console.info("config:", config)
    }
} as const satisfies Record<InboundMessageAction, Function>


sw.onmessage = (event) => event.waitUntil((async () => {
    const data = event.data as InboundMessage
    const id = (event.source as Client).id
    if (!swAction[data?.action]) {
        return console.warn(`received incorrectly encoded message ${data} from client ${id}`)
    }
    await swAction[data.action](id)
    if (data.action.startsWith("config:")) {
        persistConfig()
        console.info(`config changed, new config:`, config)
    }
})())
