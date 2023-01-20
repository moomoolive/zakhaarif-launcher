export {}
const main = async () => {
    console.info("[SANDBOX]: registering worker...")
    if (window.top === window.self) {
        console.warn("sandbox is not loaded in iframe! Place this in a sandboxed iframe for better security!")
    }
    if (!navigator.serviceWorker) {
        throw new Error("current browser doesn't support service workers")
    }
    const registration = await navigator.serviceWorker.register("sw.compiled.js")
    if (!navigator.serviceWorker.controller || !registration.active) {
        console.warn(`service worker controller not found`)
    }
    await Promise.all((await caches.keys()).map(key => caches.delete(key)))
    top?.postMessage("finished", "*")
}
main()