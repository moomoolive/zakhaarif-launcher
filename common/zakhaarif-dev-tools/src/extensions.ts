/*
import type {ExtensionShellFunctions} from "../../../src/routes/ExtensionShell"
import type {TerminalActions, wRpc} from "w-worker-rpc"
import type {InitialExtensionState} from "../../../src/lib/jsSandbox/rpcs/essential/index"

export type MessageAppShell = wRpc<ExtensionShellFunctions, {}>["execute"]

export type MainScriptArguments = {
    rootElement: HTMLDivElement
    initialState: InitialExtensionState
    messageAppShell: MessageAppShell
    addRpcResponses: (responses: TerminalActions<{}>) => boolean
    logPrivateDeps: () => void
}

export type ExtensionModule = {
    main: (args?: MainScriptArguments) => any
}
*/
export {}
