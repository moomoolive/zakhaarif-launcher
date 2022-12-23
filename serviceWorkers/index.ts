import {APP_CACHE} from "../consts"
import {OutMessageType, InboundMessageAction, InboundMessage} from "./types"
import type {BackgroundFetchUIEventCore} from "./handlers"

type BackgroundFetchUIEvent = BackgroundFetchUIEventCore & Event

type BackgroundFetchEvents = {
    "backgroundfetchsuccess": BackgroundFetchUIEvent
    "backgroundfetchfailure": BackgroundFetchUIEvent
    "backgroundfetchabort": BackgroundFetchUIEvent
    "backgroundfetchclick": BackgroundFetchUIEvent
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

const config = {
    log: true,
    savedAt: -1
}

const CACHE = caches.open(APP_CACHE).then(async (cache) => {
    const file = await cache.match(CONFIG_URL)
    if (!file) {
        persistConfig(Promise.resolve(cache))
        return cache
    }
    const parsed = await file.json() as Partial<typeof config>
    config.log = parsed.log ?? true
    config.savedAt = parsed.savedAt || -1
    return cache
})

const persistConfig = async (cache: typeof CACHE) => {
    config.savedAt = Date.now()
    return (await cache).put(
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
    if (!config.log || forceMsg) {
        return msgAll("info", msg, id)
    }
}
const errorMsg = (msg: string, id = "all") => msgAll("error", msg, id)

sw.oninstall = (event) => event.waitUntil(sw.skipWaiting())

sw.onactivate = (event) => {
    event.waitUntil((async () => {
        await sw.clients.claim()
        infoMsg("{📥 install} new script installed", "all", true)
        infoMsg(`{🔥 activate} new script in control, started with args: silent_log=${config.log}`, "all", true)
    })())
}

import {makeFetchHandler} from "./handlers"

sw.onfetch = makeFetchHandler({
    cache: CACHE, 
    rootDoc: ROOT_DOC,
    fetchFile: fetch
}) 

import {makeBackgroundFetchSuccessHandler} from "./handlers"

sw.addEventListener<"backgroundfetchsuccess">(
    "backgroundfetchsuccess",
    makeBackgroundFetchSuccessHandler({
        origin: sw.location.origin,
        fileCache: {
            getFile: async url => (await CACHE).match(url),
            putFile: async (url, file) => (await CACHE).put(url, file),
            // make later?
            queryUsage: async () => ({quota: 0, usage: 0})
        }
    })
)

const swAction = {
    "config:silent_logs": () => {
        config.log = true
    },
    "config:verbose_logs": () => {
        config.log = false
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


sw.onmessage = async (msg) => {
    const d = msg.data as InboundMessage
    const id = (msg.source as Client).id
    if (!swAction[d?.action]) {
        errorMsg(
            `received incorrectly encoded message ${msg.data}`,
            id
        )
        return
    }
    await swAction[d.action](id)
    if (d.action.startsWith("config:")) {
        persistConfig(CACHE)
        infoMsg(`persisted new config @ ${CONFIG_URL}`)
    }
}