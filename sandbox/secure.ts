import {wRpc} from "../src/lib/wRpc/simple"
import type {ServiceWorkerFunctions} from "./serviceWorkerFunctions"
import {serviceWorkerToSandboxRpc, controllerRpc} from "./sandboxFunctions"
import type {ExtensionModule, MessageAppShell} from "../src/lib/types/extensions"

if (window.top !== window.parent) {
    throw new Error("second-level embedding is disallowed")
}
if (window.self === window.top) {
    throw new Error("document must be embedded in iframe")
}
if (!("serviceWorker" in navigator)) {
    throw new Error("sandbox requires service worker to function")
}

try {
    const [registration] = await Promise.all([
        navigator.serviceWorker.ready,
        navigator.serviceWorker.register("sw.compiled.js")
    ] as const)
    const {active: sw} = registration
    const rpc = new wRpc<ServiceWorkerFunctions>({
        responses: serviceWorkerToSandboxRpc,
        messageTarget: {
            postMessage(data, transferables) {
                sw?.postMessage(data, transferables)
            },
        },
        messageInterceptor: {
            addEventListener(_, handler) {
                navigator.serviceWorker.addEventListener(
                    "message", handler
                )
            }
        }
    })
    await controllerRpc.execute("contextEstablished")
    // all security stuff should be done before this point
    const root = document.getElementById("root-script")
    const importSource = root?.getAttribute("entry") || "none"
    console.info("importing", importSource)
    const script = await import(importSource) as ExtensionModule
    if (!("main" in script)) {
        throw new Error("no main function exported from module")
    }
    const rootElement = document.createElement("div")
    rootElement.setAttribute("id", "root")
    document.body.appendChild(rootElement)
    const {main} = script
    main({
        rootElement,
        messageAppShell: ((name, data = null, transferables = []) => {
            return controllerRpc.execute(name, data, transferables)
        }) 
    })
} catch (err) {
    console.error("error when loading module", err)
}
