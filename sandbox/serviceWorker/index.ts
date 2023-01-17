import {wRpc} from "../../src/lib/wRpc/simple"
import {sandboxToServiceWorkerRpc} from "../../src/lib/utils/workerCommunication/mirrorSw"
import {createFetchHandler} from "./fetchHandler"
import {serviceWorkerToSandboxRpc} from "../../src/lib/utils/workerCommunication/sandbox"
import {APP_CACHE} from "../config"

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope

sw.oninstall = (event) => event.waitUntil(sw.skipWaiting())

sw.onactivate = (event) => event.waitUntil((async () => {
    await sw.clients.claim()
    console.info("[📥 install] new sandbox service-worker installed")
    console.info("[🔥 activate] new sandbox sevice worker in control")
})())

const rpc = new wRpc({
    responses: sandboxToServiceWorkerRpc,
    callableFunctions: serviceWorkerToSandboxRpc,
    messageTarget: {postMessage: () => {}},
    messageInterceptor: sw
})

const config = {log: true}

const fetchHandler = createFetchHandler({
    networkFetch: fetch,
    origin: sw.location.origin,
    fileCache: {
        getLocalFile: async (url) => {
            const cache = await caches.open(APP_CACHE)
            return await cache.match(url)
        },
        getClientFile: async (url, clientId) => {
            const client = await sw.clients.get(clientId)
            if (!client) {
                return null
            }
            const file = await rpc.executeWithSource(
                "getFile", client, url
            )
            console.log("from worker", file)
            return new Response("")
        },
    },
    templateHeaders: {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "cross-origin",
    },
    log: console.info,
    config,
})

sw.onfetch = (event) => {
    event.respondWith(fetchHandler(event))
}
