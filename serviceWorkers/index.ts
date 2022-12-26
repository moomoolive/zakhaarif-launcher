import {APP_CACHE} from "../consts"
import {OutMessageType, InboundMessageAction, InboundMessage} from "./types"
import type {BackgroundFetchUIEventCore, BackgroundFetchEvent} from "./handlers"
import type {FileCache} from "../shabah/shared"

type BackgroundFetchUIEvent = BackgroundFetchUIEventCore & Event

type BackgroundFetchEvents = {
    "backgroundfetchsuccess": BackgroundFetchUIEvent
    "backgroundfetchfailure": BackgroundFetchUIEvent
    "backgroundfetchabort": BackgroundFetchEvent
    "backgroundfetchclick": BackgroundFetchEvent
}

type AllServiceWorkerEvents = (
    ServiceWorkerGlobalScopeEventMap & BackgroundFetchEvents
) 

type ModifiedEvents = {
    addEventListener<K extends keyof AllServiceWorkerEvents>(type: K, listener: (this: ServiceWorkerGlobalScope, ev: AllServiceWorkerEvents[K]) => any, options?: boolean | AddEventListenerOptions): void
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void

}

const sw = globalThis.self as unknown as (
    ServiceWorkerGlobalScope & ModifiedEvents
)

const ROOT_DOC = sw.location.origin + "/"
const CONFIG_URL = ROOT_DOC + "__sw-config__.json"

let config = {
    version: 1,
    log: true,
    savedAt: -1
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
    config.savedAt = Date.now()
    return cache.put(
        CONFIG_URL, 
        new Response(JSON.stringify(config), {
            status: 200,
            statusText: "OK"
        })
    )
}

const msgAll = async (type: OutMessageType, contents: string, id = "all") => {
    const clients = id === "all" || !id
        ? await sw.clients.matchAll({})
        : (<T>(val: T) => !val ? [] : [val])(await sw.clients.get(id))
    for (const client of clients) {
        client.postMessage({type, contents})
    }
}

const infoMsg = (msg: string, id = "all", forceMsg = false) => {
    if (config.log || forceMsg) {
        return msgAll("info", msg, id)
    }
}

sw.oninstall = (event) => event.waitUntil(sw.skipWaiting())

sw.onactivate = (event) => {
    event.waitUntil((async () => {
        await sw.clients.claim()
        console.info("{📥 install} new script installed")
        console.info(`{🔥 activate} new script in control, started with config`, config)
    })())
}

import {makeFetchHandler} from "./handlers"

const fileCache = {
    getFile: async (url) => {
        const cache = await caches.open(APP_CACHE)
        return (await cache.match(url)) || null
    },
    putFile: async (url, file) => {
        const cache = await caches.open(APP_CACHE)
        await cache.put(url, file)
        return true
    },
    // make later?
    queryUsage: async () => ({quota: 0, usage: 0}),
    deleteAllFiles: async () => true,
    deleteFile: async () => true,
} as FileCache

const logger = (...msgs: any[]) => {
    if (config.log) {
        console.info(...msgs)
    }
}

const fetchHandler = makeFetchHandler({
    cache: fileCache, 
    rootDoc: ROOT_DOC,
    fetchFile: fetch,
    log: logger
})

sw.onfetch = (event) => event.respondWith(fetchHandler(event))

import {makeBackgroundFetchHandler} from "./handlers"

const bgFetchSuccessHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "success"
})

sw.addEventListener<"backgroundfetchsuccess">(
    "backgroundfetchsuccess",
    (event) => event.waitUntil(bgFetchSuccessHandle(event))
)

sw.addEventListener(
    "backgroundfetchclick", 
    () => sw.clients.openWindow("/")
)

const bgFetchAbortHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "abort"
})

sw.addEventListener<"backgroundfetchabort">(
    "backgroundfetchabort",
    (event) => event.waitUntil(bgFetchAbortHandle(event))
)

const bgFetchFailHandle = makeBackgroundFetchHandler({
    origin: sw.location.origin,
    fileCache,
    log: logger,
    type: "fail"
})

sw.addEventListener<"backgroundfetchfailure">(
    "backgroundfetchfailure",
    (event) => event.waitUntil(bgFetchFailHandle(event))
)

const swAction = {
    "config:silent_logs": () => {
        config.log = false
    },
    "config:verbose_logs": () => {
        config.log = true
    },
    "list:consts": (id: string) => {
        infoMsg(
            `listed constants: config_file_url=${CONFIG_URL}, ROOT_DOC=${ROOT_DOC}`,
            id,
            true
        )
    },
    "list:connected_clients": async (id: string) => {
        const clients = await sw.clients.matchAll()
        infoMsg(
            `connected clients (${clients.length}): ${clients.map((c) => {
                return `(id=${c.id || "unknown"}, url=${c.url}, type=${c.type})\n`
            }).join(",")}`,
            id,
            true
        )
    },
    "list:config": (id: string) => {
        infoMsg(`config: ${JSON.stringify(config)}`, id, true)
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