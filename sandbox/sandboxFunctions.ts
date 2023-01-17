import {wRpc, MessagableEntity} from "../src/lib/wRpc/simple"
import type {ControllerFunctions} from "../src/lib/utils/workerCommunication/controllerFrame"

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
}
const {parent} = window

const controllerRpc = new wRpc<ControllerFunctions>({
    responses: {},
    messageTarget: {
        postMessage: (data, transferables) => {
            parent.postMessage(data, "*", transferables)
        }
    },
    messageInterceptor: {
        addEventListener: (_, handler) => {
            window.addEventListener("message", handler)
        }
    }
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