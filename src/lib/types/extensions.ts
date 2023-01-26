import type {ControllerRpc, ExtensionShellFunctions} from "../../routes/ExtensionShell"

export type MessageAppShell = ControllerRpc["execute"]

export type MainScriptArguments = {
    rootElement: HTMLDivElement
    messageAppShell: MessageAppShell
    initialState: NonNullable<
        ReturnType<ExtensionShellFunctions["getInitialState"]>
    >
}

export type ExtensionModule = {
    main: (args?: MainScriptArguments) => any
}
