import {SERVICE_WORKER_FILE} from "./config"

const main = async () => {
    if (window.top === window.self) {
        console.warn("sandbox is not loaded in iframe! Place this in a sandboxed iframe for better security!")
    }
    if (!navigator.serviceWorker) {
        throw new Error("current browser doesn't support service workers")
    }
    console.info("[SANDBOX]: registering service worker...")
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_FILE)
    if (!registration.active) {
        console.warn(`service worker controller not found`)
    }
    const cacheKeys = await caches.keys()
    const indexeddbKeys: string[] = []
    // as of writing this Firefox doesn't yet support this
    // api (althought it is a standard)
    if ("databases" in indexedDB) {
        const databases = await (async () => { 
            try {
                return await indexedDB.databases() 
            } catch { 
                return [] 
            } 
        })()
        const databaseNames = databases.map((info) => info.name || "")
        indexeddbKeys.push(...databaseNames.filter((name) => name.length > 0))
    }
    await Promise.all([
        ...cacheKeys.map((key) => caches.delete(key)),
        ...indexeddbKeys.map((key) => indexedDB.deleteDatabase(key)),
        navigator.serviceWorker.ready
    ])
    window.setTimeout(() => {
        console.info("[SANDBOX]: service worker registered successfully") 
        top?.postMessage("finished", "*") 
    }, 2_000)
}
main()