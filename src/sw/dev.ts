const sw = globalThis.self as any//as unknown as ServiceWorkerGlobalScope

sw.addEventListener("fetch", async (event: any) => {
    const cached = await caches.match(event.request)
    event.respondWith(cached ? cached : fetch(event.request))
})

export {}
