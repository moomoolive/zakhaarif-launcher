import {wRpc} from "../../src/lib/wRpc/simple"
import {createFetchHandler} from "./fetchHandler"
import type {CallableFunctions as SandboxFunctions} from "../sandboxFunctions"

const sw = globalThis.self as unknown as ServiceWorkerGlobalScope

sw.oninstall = (event) => event.waitUntil(sw.skipWaiting())

sw.onactivate = (event) => event.waitUntil((async () => {
    await sw.clients.claim()
    console.info("[📥 install] new sandbox service-worker installed")
    console.info("[🔥 activate] new sandbox sevice worker in control")
})())

const sandboxToServiceWorkerRpc = {} as const

export type CallableFunctions = typeof sandboxToServiceWorkerRpc

const rpc = new wRpc<SandboxFunctions>({
    responses: sandboxToServiceWorkerRpc,
    messageTarget: {postMessage: () => {}},
    messageInterceptor: {
        addEventListener: (_, handler) => {
            sw.addEventListener("message", (event) => {
                event.waitUntil(handler(event))
            })
        }
    }
})

const config = {log: true}

const DEV_MODE = sw.location.origin.startsWith("http://locahost")

const accessHeaders = DEV_MODE 
    ? {"Access-Control-Allow-Origin": "http://localhost:5173"} as const
    : {"Access-Control-Allow-Origin": "*"} as const

const fetchHandler = createFetchHandler({
    networkFetch: fetch,
    origin: sw.location.origin,
    fileCache: {
        getClientFile: async (url, clientId) => {
            const client = await sw.clients.get(clientId)
            if (!client) {
                return null
            }
            const file = await rpc.executeWithSource("getFile", client, url)
            if (typeof file !== "object" || file === null) {
                return null
            }
            if (
                !(file.body instanceof ReadableStream)
                || typeof file.type !== "string"
                || typeof file.length !== "number"
            ) {
                return null
            }
            return new Response(file.body, {
                status: 200,
                statusText: "OK",
                headers: {
                    "content-type": file.type,
                    "content-length": file.length
                }
            })
        },
    },
    inMemoryDocumentHeaders: {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Vary": "origin",
        ...accessHeaders,
    },
    log: console.info,
    config,
})

sw.onfetch = (event) => event.respondWith(fetchHandler(event))
