export type MainScriptArguments = {
    rootElement: HTMLDivElement
}

export type ProgramModule = {
    main: (args?: MainScriptArguments) => any
}
