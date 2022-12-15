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
    fn: CommandCallback
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
    commands: Record<string, Command>
    isExecutingCommand: boolean
    output: OutputDevice
    private fallbackOutput: (...msgs: any[]) => any

    constructor({
        commands = {},
        onStreamOutput = () => {},
        fatalErrorCallback = () => {} 
    }: {
        commands?: Record<string, Command>,
        onStreamOutput?: OutputSteamCallback,
        fatalErrorCallback?: (...msgs: any[]) => any
    } = {}) {
        this.id = 0
        this.commands = commands
        this.isExecutingCommand = false
        this.output = new OutputDevice({
            onStream: onStreamOutput
        })
        this.fallbackOutput = fatalErrorCallback
    }

    setStreamOutput(fn: OutputSteamCallback) {
        this.output["onStream"] = fn
    }

    addCommandFn(name: string, fn: CommandCallback) {
        this.commands[name] = {fn}
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
        const command = this.commands[cmdName]
        if (!command) {
            output.error(`command "${cmdName}" was not found`)
            this.isExecutingCommand = false
            return statusCodes.notFound
        }
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