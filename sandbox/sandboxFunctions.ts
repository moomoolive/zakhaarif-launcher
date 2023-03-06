import {wRpc, MessagableEntity} from "../src/lib/wRpc/simple"
import type {ExtensionShellFunctions} from "../src/routes/ExtensionShell"

type WindowMessageEvent = {
    source: MessagableEntity
    data: unknown
    origin: string
}

const window = self as unknown as {
    readonly top : {
        postMessage: (data: unknown, origin: string, transferables: Transferable[]) => unknown
    }
    addEventListener: (name: "message", handler: (event: WindowMessageEvent) => any) => unknown
    removeEventListener: (name: "message", handler: (event: WindowMessageEvent) => any) => unknown
}

type ControllerRpcState = {
    authToken: string
}

const sandboxResponses = {
    ping: (_: null, state: ControllerRpcState) => {
        return state.authToken
    }
}

const {top, addEventListener, removeEventListener} = window

export type SandboxResponses = typeof sandboxResponses

let callback: Parameters<typeof window["addEventListener"]>[1] = () => {}

export const controllerRpc = new wRpc<
    ExtensionShellFunctions, ControllerRpcState
>({
    responses: sandboxResponses,
    messageTarget: {
        postMessage: (data, transferables) => {
            top.postMessage(data, "*", transferables)
        },
        addEventListener(_, handler) {
            callback = (event) => {
                if (event.source !== (top as object)) {
                    return
                }
                handler({data: event.data})
            }
            addEventListener("message", callback)
        },
        removeEventListener(_, __) {
            removeEventListener("message", callback)
        }
    },
    state: {authToken: ""}
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