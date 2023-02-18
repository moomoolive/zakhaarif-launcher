import {wRpc, MessagableEntity} from "../src/lib/wRpc/simple"
import type {ExtensionShellFunctions} from "../src/routes/ExtensionShell"

type WindowMessageEvent = {
    source: MessagableEntity
    data: unknown
    origin: string
}

const window = self as unknown as {
    parent : {
        postMessage: (data: unknown, origin: string, transferables: Transferable[]) => unknown
    }
    addEventListener: (name: "message", handler: (event: WindowMessageEvent) => any) => unknown
    top: object
}

const {top, parent} = window
const addListener = window.addEventListener

export const controllerRpc = new wRpc<ExtensionShellFunctions>({
    responses: {},
    messageTarget: {
        postMessage: (data, transferables) => {
            parent.postMessage(data, "*", transferables)
        }
    },
    messageInterceptor: {
        addEventListener: (_, handler) => {
            addListener("message", (event) => {
                if (event.source !== top) {
                    return
                }
                handler(event)
            })
        }
    },
    state: {}
})

export const serviceWorkerToSandboxRpc = {
    getFile: async (url: string) => {
        const file = await controllerRpc.execute("getFile", url)
        if (!file) {
            return file
        }
        return wRpc.transfer(file, [file.body])
    }
} as const

export type CallableFunctions = typeof serviceWorkerToSandboxRpc