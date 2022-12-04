// @ts-check
/// <reference no-default-lib="true"/>
/// <reference lib="ES2015" />
/// <reference lib="webworker" />

/** @type {ServiceWorkerGlobalScope} */
// @ts-ignore
const sw = globalThis.self

/** 
 * @param {"error"|"info"} type 
 * @param {string} contents 
 */
const msgAll = async (type, contents) => {
    const clients = await sw.clients.matchAll({})
    for (const client of clients) {
        client.postMessage({type, contents})
    }
}

const log = {
    info: (msg = "no msg") => msgAll("info", msg),
    error: (msg = "no msg") => msgAll("error", msg),
}

sw.addEventListener("install", async (event) => {
    event.waitUntil((async () => {
        await sw.skipWaiting()
        log.info("new script installed")
    })())
})

sw.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        await sw.clients.claim()
        log.info("all clients claimed")
    })())
})

sw.addEventListener("fetch", (event) => {
    event.respondWith((async () => {
        const cached = await caches.match(event.request)
        log.info(`recieved request for ${event.request.url}, cache_hit=${!!cached}, status=${cached?.status}, statusText=${cached?.statusText}`)
        if (cached) {
            return cached
        } else {
            return fetch(event.request)
        }
    })())
})
