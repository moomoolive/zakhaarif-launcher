import {ServiceWorkerMessageType as MsgType} from "../sharedLib/serviceWorkers"

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope

const safeArray = <T>(val: T | null | undefined) => val === undefined || val === null ? [] : [val]

const msgAll = async (type: MsgType, contents: string, id = "all") => {
    const clients = id === "all" 
        ? await sw.clients.matchAll({})
        : safeArray(await sw.clients.get(id))
    for (const client of clients) {
        client.postMessage({type, contents})
    }
}

const log = {
    info: (msg = "no msg", id = "all") => msgAll("info", msg, id),
    error: (msg = "no msg", id = "all") => msgAll("error", msg, id),
}

sw.addEventListener("install", (event) => {    
    event.waitUntil(Promise.all([
        sw.skipWaiting()
    ]))
})

sw.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        await sw.clients.claim()
        await log.info("{📥 install} new script installed")
        await log.info("{🔥 activate} new script in control")
    })())
})

sw.addEventListener("fetch", (event) => {
    event.respondWith((async () => {
        const cached = await caches.match(event.request)
        log.info(
            `recieved client ${event.clientId} request for ${event.request.url}, cache_hit=${!!cached}, status=${cached?.status || "no_status"}`,
            event.clientId
        )
        if (cached) {
            return cached
        } else {
            return fetch(event.request)
        }
    })())
})

export {}