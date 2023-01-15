//import {Rpc} from "../src/lib/workerChannel/simple"
//import {serviceWorkerFunctions, clientFunctions} from "../src/lib/utils/workerCommunication/mirrorSw"

const main = async () => {
    console.info("sandbox loaded...")
    if (window.top === window.self) {
        console.warn("sandbox is not loaded in iframe! Place this in a sandboxed iframe for better security!")
    }
    if (!navigator.serviceWorker) {
        console.warn("current browser doesn't support service workers")
        return
    }
    const registration = await navigator.serviceWorker.register("sw.compiled.js")
    if (
        !navigator.serviceWorker.controller 
        || !registration.active
    ) {
        console.warn(`service worker controller not found`)
        return
    }
    //const sw = Rpc.create({
    //    functions: clientFunctions,
    //    recipentFunctions: serviceWorkerFunctions,
    //    recipentWorker: {
    //        postMessage(data, transferables) {
    //            registration.active?.postMessage(data, transferables)
    //        },
    //        addEventListener(_, handler) {
    //            navigator.serviceWorker.addEventListener("message", handler)
    //        },
    //    }
    //})
    const rootDocument = `<!DOCTYPE html>${document.documentElement.outerHTML}`
    const CACHE_NAME = "cache-v1"
    const targetCache = await caches.open(CACHE_NAME)
    await targetCache.put(
        `${location.origin}/offline.html`,
        new Response(rootDocument, {
            status: 200,
            statusText: "OK",
            headers: {
                "content-type": "text/html",
                "content-length": (new TextEncoder().encode(rootDocument)).length.toString()
            }
        })
    )
    console.info("cached root document for offline use! Document is ready!")
    top?.postMessage({msg: "finished"}, "*")
}
main()