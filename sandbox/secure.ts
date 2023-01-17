import {wRpc} from "../src/lib/wRpc/simple"
import type {CallableFunctions as SandboxToServiceWorkerRpc} from "./serviceWorkerFunctions"
import {serviceWorkerToSandboxRpc} from "./sandboxFunctions"
import type {ProgramModule} from "../src/lib/types/programs"

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
    ])
    const {active: sw} = registration
    const _rpc = new wRpc<SandboxToServiceWorkerRpc>({
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
    // all security stuff should be done before this point
    const root = document.getElementById("root-script")
    const importSource = root?.getAttribute("entry") || "none"
    console.info("importing", importSource)
    const script = await import(importSource) as ProgramModule
    if (!("main" in script)) {
        throw new Error("no main function exported from module")
    }
    const rootElement = document.createElement("div")
    rootElement.setAttribute("id", "root")
    document.body.appendChild(rootElement)
    const {main} = script
    main({rootElement})
} catch (err) {
    console.error("error when loading module", err)
}
