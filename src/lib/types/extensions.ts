import type {ControllerRpc} from "../../appShell/ExtensionShell"

export type MessageAppShell = ControllerRpc["execute"]

export type MainScriptArguments = {
    rootElement: HTMLDivElement
    messageAppShell: MessageAppShell
}

export type ExtensionModule = {
    main: (args?: MainScriptArguments) => any
}
