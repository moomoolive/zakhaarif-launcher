import {Rpc} from "../../src/lib/workerChannel/simpleServiceWorker"
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

const rpc = Rpc.create({
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
        getFile: async (url, clientId) => {
            const client = await sw.clients.get(clientId)
            if (!client) {
                return
            }
            const file = await rpc.getFile(client, url)
            console.log("from worker", file)
            return new Response("")
        },
    }
})

sw.onfetch = (event) => {
    event.respondWith(fetchHandler(event))
}
