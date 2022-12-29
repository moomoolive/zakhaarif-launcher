type MsgType = "error" | "info" | "warn" | "log" | "cmd"



export class TerminalMsg {
    readonly type: MsgType
    readonly text: string

    constructor(type: MsgType, text: string) {
        this.text = text
        this.type = type
    }
}

class OutputDevice {
    private onStream: OutputSteamCallback
    private inputPromise: null | {
        resolve: (value: string) => void,
        reject: (reason?: any) => void
    }

    constructor(params: {
        onStream: OutputSteamCallback
    }) {
        this.onStream = params.onStream 
        this.inputPromise = null
    }

    reset() {
        const {inputPromise} = this
        if (!inputPromise) {
            return
        }
        inputPromise.reject("forcefully closed by application")
        this.inputPromise = null
    }

    error(text: string) {
        this.onStream(new TerminalMsg("error", text))
    }

    warn(text: string) {
        this.onStream(new TerminalMsg("warn", text))
    }

    info(text: string) {
        this.onStream(new TerminalMsg("info", text))
    }

    log(text: string) {
        this.onStream(new TerminalMsg("log", text))
    }

    command(text: string) {
        this.onStream(new TerminalMsg("cmd", text))
    }

    input(text: string) {
        this.log(text)
        const self = this
        return new Promise<string>((resolve, reject) => {
            self.inputPromise = {resolve, reject}
        })
    }

    isWaitingOnInput() {
        return !!this.inputPromise
    }

    injectInput(value: string) {
        if (this.inputPromise) {
            this.inputPromise.resolve(value)
        }
    }
}

type ExitStatus = 0 | 1

type CommandStatus = ExitStatus | void

export type CommandCallback = (
    output: OutputDevice, 
    args: CommandArgs
) => Promise<CommandStatus> | CommandStatus

type Command = {
    fn: CommandCallback,
    source: string
    name: string
}

type CommandArgs = {
    raw: string
    input: string
    self: Readonly<TerminalEngine>
}

type OutputSteamCallback = (msg: TerminalMsg) => void

const findFirstSpace = (str: string) => {
    for (let i = 0; i < str.length; i++) {
        if (str[i] === " ") {
            return i
        }
    }
    return -1
}

export type CommandsList = ReadonlyArray<
    Readonly<{name: string, source: string}>
>

export const statusCodes = {
    ok: 0,
    emptyInput: 1,
    commandInProgress: 2,
    notFound: 3,
    fatalError: 4,
    injectedInputToCommand: 5
} as const

export class TerminalEngine {
    id: number
    isExecutingCommand: boolean
    output: OutputDevice

    private commandsList: Command[]
    private commandsIndex: Map<string, number>
    private fallbackOutput: (...msgs: any[]) => any

    constructor({
        onStreamOutput = () => {},
        fatalErrorCallback = () => {} 
    }: {
        commands?: Record<string, Command>,
        onStreamOutput?: OutputSteamCallback,
        fatalErrorCallback?: (...msgs: any[]) => any
    } = {}) {
        this.id = 0
        this.isExecutingCommand = false
        this.output = new OutputDevice({
            onStream: onStreamOutput
        })
        this.fallbackOutput = fatalErrorCallback
        this.commandsList = []
        this.commandsIndex = new Map()
    }

    setStreamOutput(fn: OutputSteamCallback) {
        this.output["onStream"] = fn
    }

    getAllCommands() {
        return this.commandsList as ReadonlyArray<
            Readonly<{name: string, source: string}>
        >
    }

    addCommandFn(
        name: string, 
        fn: CommandCallback, 
        {source = "unknown"} = {}
    ) {
        const command = {fn, source, name}
        if (this.commandsIndex.has(name)) {
            const index = this.commandsIndex.get(name)!
            this.commandsList[index] = command   
            return
        }
        const index = this.commandsList.length
        this.commandsList.push(command)
        this.commandsIndex.set(name, index)
    }

    removeCommand(name: string) {
        const {commandsIndex, commandsList} = this
        if (
            commandsList.length < 1 
            || !commandsIndex.has(name)
        ) {
            return
        }
        const index = this.commandsIndex.get(name)!
        commandsIndex.delete(name)
        if (commandsList.length < 2) {
            commandsList.pop()
            return
        }
        const lastCommand = commandsList.at(-1)!
        commandsList[index] = {...lastCommand}
        commandsIndex.set(lastCommand.name, index)
        commandsList.pop()
    }

    /*
    queryCommands(query: string) {
        const predictions = []
        for (let i = 0; i < this.commandsList.length; i++) {
            const {name, source} = this.commandsList[i]
            if (name.includes(query) || source.includes(query)) {
                predictions.push({name, source})
            }
        }
        return predictions
    }
    */

    isWaitingOnInput() {
        return this.output.isWaitingOnInput()
    }

    async exec(cmd: string) {
        const {output} = this
        const waitingOnInput = output.isWaitingOnInput()
        if (!waitingOnInput) {
            output.command(cmd)
        }
        if (cmd.length < 1) {
            return statusCodes.emptyInput
        }
        const trimmed = cmd.trim()
        if (waitingOnInput) {
            output.info(trimmed)
            output.injectInput(trimmed)
            return statusCodes.injectedInputToCommand
        }
        // concurrent commands are not allowed
        if (this.isExecutingCommand) {
            return statusCodes.commandInProgress
        }
        this.isExecutingCommand = true
        const firstSpace = findFirstSpace(trimmed)
        const cmdName = firstSpace < 0
            ? trimmed
            : trimmed.slice(0, firstSpace)
        const exists = this.commandsIndex.has(cmdName)
        if (!exists) {
            output.error(`command "${cmdName}" was not found`)
            this.isExecutingCommand = false
            return statusCodes.notFound
        }
        const index = this.commandsIndex.get(cmdName)!
        const command = this.commandsList[index]
        let exitCode = 0
        try {
            const raw = trimmed.slice(firstSpace + 1)
            const res = await command.fn(output, {
                raw,
                input: trimmed,
                self: this
            })
            exitCode = res || statusCodes.ok
        } catch (err) {
            this.fallbackOutput(err)
            output.error(`command ended with fatal error: ${String(err)}. Check console for more details`)
            exitCode = statusCodes.fatalError
        }
        output.reset()
        this.isExecutingCommand = false
        return exitCode
    }

    exit(msg = "") {
        this.output.reset()
        if (msg.length > 0) {
            console.info(msg)
        }
    }
}