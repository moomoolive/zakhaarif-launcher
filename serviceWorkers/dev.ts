import {
    ServiceWorkerMessageType as OutMsgType,
    ServiceWorkerOutBoundMessage as InMsgType
} from "./types"

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope

const safeArray = <T>(val: T | null | undefined) => val === undefined || val === null ? [] : [val]

const log = {
    silent: true,
    info(msg: string, id = "all", forceLog = false) {
        if (forceLog || !this.silent) {
            return this.msgAll("info", msg, id)
        }
    },
    error(msg: string, id = "all") {
        return this.msgAll("error", msg, id)
    },
    async msgAll(
        type: OutMsgType, 
        contents: string, 
        id = "all"
    ) {
        const clients = id === "all" 
            ? await sw.clients.matchAll({})
            : safeArray(await sw.clients.get(id))
        for (const client of clients) {
            client.postMessage({type, contents})
        }
    }
}

sw.addEventListener("message", (msg) => {
    const d = msg.data as InMsgType
    if (!d || typeof d.action !== "string") {
        log.error(
            `received incorrectly encoded message from client`
        )
        return
    }
    const {action} = d
    switch (action) {
        case "silence-logs":
            log.silent = true
            break
        case "verbose-logs":
            log.silent = false
            break
    }
})

sw.addEventListener("install", (event) => {    
    event.waitUntil(Promise.all([
        sw.skipWaiting()
    ]))
})

sw.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        await sw.clients.claim()
        await log.info("{📥 install} new script installed", "all", true)
        await log.info(`{🔥 activate} new script in control, started with args: silent_log=${log.silent}`, "all", true)
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