import {Rpc, MessagableEntity} from "../../src/lib/workerChannel/simpleServiceWorker"
import {serviceWorkerFunctions, clientFunctions} from "../../src/lib/utils/workerCommunication/mirrorSw"

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

sw.onfetch = (event) => {
    console.log("incoming request", event.request.url, event.request)
    event.respondWith((async () => {
        const {request} = event
        if (request.url === `${sw.location.origin}/`) {
            return fetch(request)
        }
        const {clientId, resultingClientId} = event
        const id = clientId || resultingClientId
        const client = await sw.clients.get(id)
        console.log("client", client)
        if (client) {
            const file = await rpc.getFile(
                client as MessagableEntity, 
                request.url
            )
            console.log("response from worker", file)
        }
        return fetch(request)
    })())
}
