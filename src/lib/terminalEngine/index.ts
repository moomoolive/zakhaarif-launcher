import {type} from "../utils/betterTypeof"
import {Result} from "../monads/result"

const messageTypes = {
	input: 0,
	log: 1,
	error: 2,
	warn: 3,
	command: 4,
	info: 5,
	append: 100,
	preappend: 101,
	replace: 102,
	remove: 103
} as const

type MsgType = typeof messageTypes[keyof typeof messageTypes]

export class TerminalMsg {
	static readonly TYPES = messageTypes

	static remove = (id: string) => new TerminalMsg(id, messageTypes.remove, "")
	static replace = (id: string, msg: string) => new TerminalMsg(id, messageTypes.replace, msg)
	static preappend = (id: string, msg: string) => new TerminalMsg(id, messageTypes.preappend, msg)
	static append = (id: string, msg: string) => new TerminalMsg(id, messageTypes.append, msg)
	static info = (id: string, msg: string) => new TerminalMsg(id, messageTypes.info, msg)
	static command = (id: string, msg: string) => new TerminalMsg(id, messageTypes.command, msg)
	static warn = (id: string, msg: string) => new TerminalMsg(id, messageTypes.warn, msg)
	static error = (id: string, msg: string) => new TerminalMsg(id, messageTypes.error, msg)
	static log = (id: string, msg: string) => new TerminalMsg(id, messageTypes.log, msg)
	static input = (id: string, msg: string) => new TerminalMsg(id, messageTypes.input, msg)

	readonly type: MsgType
	readonly text: string
	readonly id: string

	constructor(id: string, msgType: MsgType, text: string) {
		this.id = id
		this.text = text
		this.type = msgType
	}
}

class OutputDevice {
	private onStream: OutputSteamCallback
	private inputPromise: null | {
        resolve: (value: string) => void,
        reject: (reason?: unknown) => void
    }
	private idCount: number

	constructor(params: {
        onStream: OutputSteamCallback
    }) {
		this.onStream = params.onStream 
		this.inputPromise = null
		this.idCount = 0
	}

	reset() {
		const {inputPromise} = this
		if (!inputPromise) {
			return
		}
		inputPromise.reject("forcefully closed by application")
		this.inputPromise = null
	}

	private generateId() {
		return (this.idCount++).toString()
	}

	error(text: string) {
		this.onStream(TerminalMsg.error(this.generateId(), text))
	}

	warn(text: string) {
		this.onStream(TerminalMsg.warn(this.generateId(), text))
	}

	info(text: string) {
		this.onStream(TerminalMsg.info(this.generateId(), text))
	}

	log(text: string) {
		this.onStream(TerminalMsg.log(this.generateId(), text))
	}

	command(text: string) {
		this.onStream(TerminalMsg.command(this.generateId(), text))
	}

	previousId() {
		return (this.idCount - 1).toString()
	}

	append(id: string, text: string) {
		this.onStream(TerminalMsg.append(id, text))
	}

	preappend(id: string, text: string) {
		this.onStream(TerminalMsg.append(id, text))
	}
    
	replace(id: string, text: string) {
		this.onStream(TerminalMsg.append(id, text))
	}

	remove(id: string) {
		this.onStream(TerminalMsg.remove(id))
	}

	inputResponse(text: string) {
		this.onStream(TerminalMsg.input(this.generateId(), text))
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

type Bool = "bool"
type Num = "num"
type OptionalNum = "num?"
type Int = "int"
type OptionalInt = "int?"
type Float = "float"
type OptionalFloat = "float?"
type Str = "str"
type OptionalStr = "str?"

export type ValidInputType = (
    Bool
    | Num | OptionalNum
    | Int | OptionalInt
    | Float | OptionalFloat
    | Str | OptionalStr
)

type InputBoolean<T extends string> = T extends "bool" ? boolean : never
type InputNumber<T extends string> = T extends "num" ? number : never
type InputOptionalNumber<T extends string> = T extends "num?" ? number : never
type InputInt<T extends string> = T extends "int" ? number : never
type InputOptionalInt<T extends string> = T extends "int?" ? number : never
type InputFloat<T extends string> = T extends "float" ? number : never
type InputOptionalFloat<T extends string> = T extends "float?" ? number : never
type InputString<T extends string> = T extends "str" ? string : never
type InputOptionalString<T extends string> = T extends "str?" ? string : never

type CommandInputType<T extends string> = (
    InputBoolean<T>
    | InputNumber<T> | InputOptionalNumber<T>
    | InputInt<T> | InputOptionalInt<T>
    | InputFloat<T> | InputOptionalFloat<T>
    | InputString<T> | InputOptionalString<T>
)

type InputState = {
    [key: string]: string | number
}

type InputDefinitionsToInputs<
    Definition extends CommandInputDefinition
> = {
    readonly [key in keyof Definition]: CommandInputType<Definition[key]> 
}

export type CommandInputDefinition = {
    readonly [key: string]: ValidInputType
}

export const statusCodes = {
	ok: 0,
	emptyInput: 1,
	commandInProgress: 2,
	notFound: 3,
	fatalError: 4,
	injectedInputToCommand: 5,
	argumentParsingError: 6,
	ioError: 7
} as const

type ExitStatus = typeof statusCodes[keyof typeof statusCodes]

type CommandStatus = ExitStatus | void

type CommandReturn = Promise<CommandStatus> | CommandStatus

export type CommandCallback<Inputs extends CommandInputDefinition = CommandInputDefinition> = (
    output: Pick<OutputDevice, (
        "append" | "info" | "error"
        | "log" | "input" | "warn"
        | "preappend" | "replace"
        | "previousId" | "remove"
    )>, 
    args: CommandArgs<Inputs>
) => CommandReturn

export type CommandDefinition<Inputs extends CommandInputDefinition = CommandInputDefinition> = {
    name: string
    fn: CommandCallback<Inputs>
    source?: string
    documentation?: (() => Promise<string>) | null
    inputs?: Inputs
}

export type InputDefinitionTokens = {name: string, type: ValidInputType}[]

type Command = {
    fn: CommandCallback,
    source: string
    name: string
    documentation: (() => Promise<string>) | null
    inputs: InputDefinitionTokens
}

type TerminalCommandsReference = ReadonlyArray<
Readonly<{
    name: string, 
    source: string
    inputs: ReadonlyArray<
        Readonly<InputDefinitionTokens[number]>
    >
}>
>

type CommandArgs<Inputs extends CommandInputDefinition> = {
    rawInput: string
    completeCommand: string
    allCommands: TerminalCommandsReference
    exitCodes: typeof statusCodes
    parsedInputs: InputDefinitionsToInputs<Inputs>
    undefinedInputs: Map<string, string>
    command: Readonly<Command>
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

export const isValidInputDefinition = (input: unknown) => {
	if (type(input) !== "object") {
		return false
	}
	const definition = input as Record<string, unknown>
	const keys = Object.keys(definition)
	if (keys.length < 1) {
		return true
	}
	for (let i = 0; i < keys.length; i++) {
		const keyName = keys[i]
		if (
			keyName ===   DOCUMENTATION_COMMAND
            || keyName.includes("=")
            || keyName.includes("\"")
		) {
			return false
		}
		const dataType = definition[keyName]
		if (typeof dataType !== "string") {
			return false
		}
		switch (dataType) {
		case "bool":
		case "str":
		case "str?":
		case "num":
		case "num?":
		case "int":
		case "int?":
		case "float":
		case "float?":
			break
		default:
			return false
		}
	}
	return true
}

const parserResponse = (
	error: string,
	state: InputState,
	undefinedInputs: Map<string, string>
) => {
	return {error, state, undefinedInputs}
}

const recycleMap = new Map<string, string>()
const recycleState = {} as InputState

const parserError = (error: string) => parserResponse(
	error, recycleState, recycleMap
)

const containCommand = async <T extends CommandInputDefinition>(
	command: CommandCallback<T>,
	outputDevice: OutputDevice,
	args: CommandArgs<T>
) => {
	return await command(outputDevice, args)
}

const getDocs: CommandCallback = async (output, {command}) => {
	output.info(`searching for "${command.name}" docs...`)
	const milliseconds = 500
	const targetMsgId = output.previousId()
	const listenerId = setInterval(() => {
		output.append(targetMsgId, ".")
	}, milliseconds)
	let docsText = "no documentation found 😭"
	if (command.documentation) {
		docsText = await command.documentation()
	}
	output.info("\n")
	output.info("----- [DOCS] -----")
	output.info("\n")
	output.info(docsText)
	clearInterval(listenerId)
}

export const parseInput = (
	input: string,
	definitionTokens: InputDefinitionTokens
) => {
	// remove leading and trailing spaces
	const cleaned = input.trim()

	const tokens = []
	let quotesOpen = false
	let equalOpen = false
	let tokenStart = 0
	let tokenEnd = 0
	for (let i = 0; i < cleaned.length; i++) {
		const char = cleaned[i]
		const lastCharacter = i >= cleaned.length - 1
		if (char === " " && !quotesOpen) {
			tokens.push(
				cleaned.slice(tokenStart, tokenEnd)
			)
			equalOpen = false
			let foundNextToken = false
			// skip all spaces in between words
			for (let x = i + 1; x < cleaned.length; x++) {
				const innerChar = cleaned[x]
				if (innerChar !== " ") {
					const nextStart = x
					i = nextStart
					tokenStart = nextStart
					tokenEnd = nextStart
					foundNextToken = true
					break
				}
			}
			if (!foundNextToken) {
				i = cleaned.length - 1
			}
		} else if (
			(lastCharacter && !quotesOpen)
            || (lastCharacter && quotesOpen && char === "\"")
		) {
			tokens.push(cleaned.slice(tokenStart))
		} else if (lastCharacter && quotesOpen) {
			return parserError(`You forgot to close quotations at the end of input. Quotation started at character: ${tokenStart + 1}`)
		} else if (char === "=" && !equalOpen) {
			equalOpen = true
		} else if (char === "=" && equalOpen && !quotesOpen) {
			let firstEqual = 0
			for (let x = 0; x < cleaned.length; x++) {
				if (cleaned[x] === "=") {
					firstEqual = x
					break
				}
			}
			return parserError(`equal sign "=" cannot be used in an argument name. Error at character ${firstEqual + 1}`)
		} else if (char === "\"" && !equalOpen) {
			return parserError(`double quotes can only be used after an equal sign. Error at character ${i + 1}`)
		} else if (char === "\"" && !quotesOpen) {
			quotesOpen = true
		} else if (
			quotesOpen 
            && char === "\""
            && i > 0
            && cleaned[i - 1] !== "\\"
		) {
			quotesOpen = false
		}
		tokenEnd++
	}

	const keyValuePairs = []
	for (let x = 0; x < tokens.length; x++) {  
		const token = tokens[x]
		let split = -1
		for (let i = 0; i < token.length; i++) {
			if (token[i] === "=" && i < token.length - 1) {
				split = i
				break
			}
		}
		if (
			split < 0 
            && token.length > 0 
            && token[token.length - 1] === "="
		) {
			return parserError(`an equal sign must be followed by a value. "${token}" is an invalid use of the equal sign`)
		} else if (split < 0) {
			keyValuePairs.push({key: token, value: ""})
		} else {
			const key = token.slice(0, split)
			const value = token.slice(split + 1)
			keyValuePairs.push({key, value})
		}
	}

	const state = {} as InputState
	const undefinedInputs = new Map<string, string>()
	for (let i = 0; i < keyValuePairs.length; i++) {
		const {key, value} = keyValuePairs[i]
		let found = false
		let validatedInputType = "" as ValidInputType | ""
		for (let x = 0; x < definitionTokens.length; x++) {
			const token = definitionTokens[x]
			if (token.name === key) {
				found = true
				validatedInputType = token.type
				break
			}
		}
		if (!found) {
			undefinedInputs.set(key, value)
			continue
		}
		switch (validatedInputType) {
		case "bool":
			if (
				value.length > 0
                    && value !== "false" 
                    && value !== "true"
			) {
				return parserError(`"${key}" is a boolean, expected true or false, got "${value}"`)
			}

			Object.defineProperty(state, key, {
				value: value.length > 0
					? value === "true"
					: true,
				enumerable: true,
				writable: true
			})
			break
		case "int":
		case "int?": {
			const num = parseInt(value, 10)
			if (isNaN(num)) {
				return parserError(`"${key}" option is an number (integer), got "${value}"`)
			}
			Object.defineProperty(state, key, {
				value: num,
				enumerable: true,
				writable: true
			})
		}
			break
		case "float":
		case "float?":
		case "num":
		case "num?": {
			const num = parseFloat(value)
			if (isNaN(num)) {
				return parserError(`"${key}" option is an number${validatedInputType === "num" || validatedInputType === "num?" ? "" : " (float)"}, got "${value}"`)
			}
			Object.defineProperty(state, key, {
				value: num,
				enumerable: true,
				writable: true
			})
		}
			break
		case "str":
		case "str?": {
			if (
				value.length < 2
                    || value[0] !== "\""
                    || value[value.length - 1] !== "\""
			) {
				return parserError(`"${key}" option is a string, which must be enclosed by double quotes. Expected "${value}" got ${value}`)
			}
			Object.defineProperty(state, key, {
				value: value.slice(1, -1),
				enumerable: true,
				writable: true
			})
		}
			break
		default:
			break
		}
	}

	for (let i = 0; i < definitionTokens.length; i++) {
		const {name, type: tokenType} = definitionTokens[i]
		const isOptional = tokenType.endsWith("?")
		let found = false
		for (let x = 0; x < keyValuePairs.length; x++) {
			const {key} = keyValuePairs[x]
			if (key === name) {
				found = true
				break
			}
		}
		if (found) {
			continue
		}
		if (!isOptional && tokenType !== "bool") {
			const friendlyType = ((t: typeof tokenType) => {
				switch (t) {
				case "float":
				case "int":
				case "num":
					return `${t === "num" ? "" : t + " / "}number type`
				case "str":
					return "string type"
				default:
					return "unknown type"
				}
			})(tokenType)
			return parserError(`"${name}" option (${friendlyType}) is required`)
		}
		switch (tokenType) {
		case "bool":
			Object.defineProperty(state, name, {
				value: false,
				enumerable: true,
				writable: true
			})
			break
		case "int?":
		case "float?":
		case "num?":
			Object.defineProperty(state, name, {
				value: NaN,
				enumerable: true,
				writable: true
			})
			break
		case "str?":
			Object.defineProperty(state, name, {
				value: "",
				enumerable: true,
				writable: true
			})
			break
		default:
			break
		}
	}
	return parserResponse("", state, undefinedInputs)
}

const DOCUMENTATION_COMMAND = "help"
const DOCUMENTATION_COMMAND_BOOL = "help=true"

export class TerminalEngine {
	static readonly EXIT_CODES = statusCodes
	static readonly OUTPUT_TYPES = messageTypes
	static readonly DOCUMENTATION_COMMAND = DOCUMENTATION_COMMAND

	id: number
	isExecutingCommand: boolean
	output: OutputDevice

	private commandsList: Command[]
	private commandsIndex: Map<string, number>
	private fallbackOutput: (...msgs: unknown[]) => unknown

	constructor({
		onStreamOutput = () => {},
		fatalErrorCallback = () => {} 
	}: {
        commands?: Record<string, Command>,
        onStreamOutput?: OutputSteamCallback,
        fatalErrorCallback?: (...msgs: unknown[]) => unknown
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
		return this.commandsList as TerminalCommandsReference
	}

	statusCodes() {
		return statusCodes
	}

	addCommand<Input extends CommandInputDefinition>({
		name,
		fn,
		source = "unknown",
		documentation = null,
		inputs = {} as Input
	}: CommandDefinition<Input>) {
		if (
			name.length < 1 
            || name.split(" ").length > 1
            || name.includes("=")
            || name.includes("\"")
            || this.commandsIndex.has(name)
            || !isValidInputDefinition(inputs)
		) {
			return
		}
		const index = this.commandsList.length
		this.commandsList.push({
			fn: fn as CommandCallback<CommandInputDefinition>, 
			source, 
			name,
			documentation,
			inputs: Object.keys(inputs).map((fieldName) => {
				return {name: fieldName, type: inputs[fieldName]}
			})
		})
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
		const index = this.commandsIndex.get(name) || 0
		commandsIndex.delete(name)
		if (commandsList.length < 2) {
			commandsList.pop()
			return
		}
		const lastCommand = commandsList.at(-1) as Command
		commandsList[index] = {...lastCommand}
		commandsIndex.set(lastCommand.name, index)
		commandsList.pop()
	}

	isWaitingOnInput() {
		return this.output.isWaitingOnInput()
	}

	async execute(cmd: string): Promise<ExitStatus> {
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
			output.inputResponse(trimmed)
			output.injectInput(trimmed)
			return statusCodes.injectedInputToCommand
		}
		// concurrent commands are not allowed
		if (this.isExecutingCommand) {
			return statusCodes.commandInProgress
		}
		const firstSpace = findFirstSpace(trimmed)
		const cmdName = firstSpace < 0
			? trimmed
			: trimmed.slice(0, firstSpace)
		const exists = this.commandsIndex.has(cmdName)
		if (!exists) {
			output.error(`command "${cmdName}" was not found`)
			return statusCodes.notFound
		}
		const index = this.commandsIndex.get(cmdName) || 0
		const command = this.commandsList[index]
		const raw = trimmed.slice(firstSpace + 1)
		if (
			raw === DOCUMENTATION_COMMAND
            || raw === DOCUMENTATION_COMMAND_BOOL
		) {
			return this.runCommandSafely(getDocs, {
				rawInput: raw,
				completeCommand: trimmed,
				allCommands: this.commandsList,
				exitCodes: statusCodes,
				parsedInputs: {},
				undefinedInputs: new Map(),
				command
			}, statusCodes.ioError)
		}
		const {state, error, undefinedInputs} = parseInput(raw, command.inputs)
		if (error.length > 0) {
			output.error("an error occurred when parsing command:")
			output.error(error)
			return statusCodes.argumentParsingError
		}
		const {fn} = command
		return await this.runCommandSafely(fn, {
			rawInput: raw,
			completeCommand: trimmed,
			allCommands: this.commandsList,
			exitCodes: statusCodes,
			parsedInputs: state,
			undefinedInputs,
			command
		})
	}

	private async runCommandSafely<T extends CommandInputDefinition>(
		command: CommandCallback<T>,
		args: CommandArgs<T>,
		errorReturnCode: ExitStatus = statusCodes.fatalError
	) {
		this.isExecutingCommand = true
		const {output} = this
		const result = await Result.wrapPromise(
			containCommand(command, output, args)
		)
		if (result.ok) {
			this.reset()
			return result.data || statusCodes.ok
		}
		this.fallbackOutput(result.msg)
		output.error(`command ended with fatal error: ${result.msg}. Check console for more details`)
		this.reset()
		return errorReturnCode
	}

	private reset() {
		this.output.reset()
		this.isExecutingCommand = false
	}

	exit(msg = "") {
		this.reset()
		if (msg.length > 0) {
			this.output.info("Closing terminal session. Goodbye.")
		}
	}
}