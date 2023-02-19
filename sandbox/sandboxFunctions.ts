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
}

const {top} = window
const addListener = window.addEventListener

type ControllerRpcState = {
    authToken: string
}

const sandboxResponses = {
    ping: (_: null, state: ControllerRpcState) => {
        return state.authToken
    }
}

export type SandboxResponses = typeof sandboxResponses

export const controllerRpc = new wRpc<
    ExtensionShellFunctions, ControllerRpcState
>({
    responses: sandboxResponses,
    messageTarget: {
        postMessage: (data, transferables) => {
            top.postMessage(data, "*", transferables)
        }
    },
    messageInterceptor: {
        addEventListener: (_, handler) => {
            addListener("message", (event) => {
                if (event.source !== (top as object)) {
                    return
                }
                handler({data: event.data})
            })
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