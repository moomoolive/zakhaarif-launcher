import {Rpc} from "../src/lib/workerChannel/simple"
import {serviceWorkerFunctions, clientFunctions} from "../src/lib/utils/workerCommunication/mirrorSw"
import type {ProgramModule} from "../src/lib/types/programs"

if (window.top !== window.parent) {
    throw new Error("second-level embedding is disallowed")
}
if (window.self === window.top) {
    throw new Error("document must be embedded in iframe")
}
const root = document.getElementById("root-script")
try {
    const importSource = root?.getAttribute("entry") || "none"
    console.info("importing", importSource)
    const script = await import(importSource) as ProgramModule
    if (!("main" in script)) {
        throw new Error("no main function exported from module")
    }
    const rootElement = document.createElement("div")
    rootElement.setAttribute("id", "root")
    document.body.appendChild(rootElement)
    const registration = await navigator.serviceWorker.ready
    const {active: sw} = registration
    const _rpc = Rpc.create({
        functions: clientFunctions,
        recipentFunctions: serviceWorkerFunctions,
        recipentWorker: {
            postMessage(data, transferables) {
                sw?.postMessage(data, transferables)
            },
            addEventListener(_, handler) {
                navigator.serviceWorker.addEventListener("message", handler)
            },
        }
    })
    const {main} = script
    main({rootElement})
} catch (err) {
    console.error("error when loading module", err)
}