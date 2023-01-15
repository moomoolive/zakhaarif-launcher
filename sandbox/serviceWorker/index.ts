import {Rpc, MessagableEntity} from "../../src/lib/workerChannel/simpleServiceWorker"
import {serviceWorkerFunctions, clientFunctions} from "../../src/lib/utils/workerCommunication/mirrorSw"
import {createFetchHandler} from "./fetchHandler"
import {APP_CACHE} from "../config"

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope

sw.oninstall = (event) => event.waitUntil(sw.skipWaiting())

sw.onactivate = (event) => event.waitUntil((async () => {
    await sw.clients.claim()
    console.info("[📥 install] new sandbox service-worker installed")
    console.info("[🔥 activate] new sandbox sevice worker in control")
})())

const _rpc = Rpc.create({
    functions: serviceWorkerFunctions,
    recipentFunctions: clientFunctions,
    globalScope: sw
})

const fetchHandler = createFetchHandler({
    networkFetch: fetch,
    origin: sw.location.origin,
    fileCache: {
        getLocalFile: async (url) => {
            const cache = await caches.open(APP_CACHE)
            return await cache.match(url)
        },
        getClientFile: async (clientId, url) => {
            return new Response("")
        },
    }
})

sw.onfetch = (event) => {
    console.log("incoming request", event.request.url, event.request)
    event.respondWith(fetchHandler(event))
}
