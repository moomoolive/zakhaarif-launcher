export type ConsoleArgNumber = "number"
export type ConsoleArgOptionalNumber = "number?"
export type ConsoleArgBool = "boolean"
export type ConsoleArgOptionalBool = "boolean?"
export type ConsoleArgString = "string"
export type ConsoleArgOptionalString = "string?"

export type ConsoleArgType = (
    ConsoleArgBool
    | ConsoleArgOptionalBool
    | ConsoleArgNumber
    | ConsoleArgOptionalNumber
    | ConsoleArgOptionalString
    | ConsoleArgString
)

export type ConsoleParsedArg<T extends ConsoleArgType> = (
    T extends "number"
    ? number
    : T extends "number?"
    ? number | undefined
    : T extends "boolean" 
    ? boolean
    : T extends "boolean?"
    ? boolean | undefined
    : T extends "string"
    ? string
    : T extends "string?"
    ? string | undefined
    : never 
)

export type ConsoleCommandInputDeclaration = {
    readonly [key: string]: ConsoleArgType
}

export type ParsedConsoleCommandInput<
    T extends ConsoleCommandInputDeclaration
> = {
    [key in keyof T]: ConsoleParsedArg<T[key]>
}