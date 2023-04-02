import type {
	Allocator,
	TimeUtils,
	ModMetadata,
	ConsoleCommandIndex,
	ThreadUtils,
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
	ModConsoleCommand
} from "zakhaarif-dev-tools"
import type {
	ShaheenEngineImpl,
	EcsImpl,
	EcsSystemImpl
} from "zakhaarif-dev-tools/implement"
import {
	calloc, 
	realloc,
	malloc,
	free,
} from "./engine_allocator/pkg/engine_allocator"

export function validateCommandInput<
	T extends ConsoleCommandInputDeclaration
>(
	types: T,
	input: ParsedConsoleCommandInput<T>,
	commandName: string
): string {
	if (
		typeof input !== "object" 
		|| input === null
	) {
		return `[${commandName}] console command input must be an "object". Got "${input === null ? "null" : typeof input}"`
	}

	const allKeys = Object.keys(types)
	const requiredKeys = []
	for (let i = 0; i < allKeys.length; i++) {
		const key = allKeys[i]
		const type = types[key]
		if (!type.endsWith("?")) {
			requiredKeys.push(key)
		}
	}

	const inputKeys = Object.keys(input)
	if (inputKeys.length < requiredKeys.length) {
		const missingArgs = []
		for (let i = 0; i < requiredKeys.length; i++) {
			const required = requiredKeys[i]
			if (input[required] === undefined) {
				missingArgs.push(`${required} (${types[required]})`)
			}
		}
		return `[${commandName}] missing required arguments: ${missingArgs.join(", ")}`
	}

	const invalidTypes = []

	for (let i = 0; i < allKeys.length; i++) {
		const targetKey = allKeys[i]
		const targetType = types[targetKey]
		const inputValue = input[targetKey]
		const inputType = typeof inputValue
		
		switch (targetType) {
		case "boolean": {
			if (inputType !== "boolean") {
				invalidTypes.push(`expected "${targetKey}" to be a "boolean" got "${typeof inputValue}"`)
			}
			break
		}
		case "boolean?": {
			if (inputType !== "undefined" && inputType !== "boolean") {
				invalidTypes.push(`expected "${targetKey}" to be a "boolean" got "${typeof inputValue}"`)
			}
			break
		}
		case "string": {
			if (inputType !== "string") {
				invalidTypes.push(`expected "${targetKey}" to be a "string" got "${typeof inputValue}"`)
			}
			break
		}
		case "string?": {
			if (inputType !== "undefined" && inputType !== "string") {
				invalidTypes.push(`expected "${targetKey}" to be a "string" got "${typeof inputValue}"`)
			}
			break
		}
		case "number": {
			if (inputType !== "number") {
				invalidTypes.push(`expected "${targetKey}" to be a "number" got "${typeof inputValue}"`)
			}
			break
		}
		case "number?": {
			if (inputType !== "undefined" && inputType !== "number") {
				invalidTypes.push(`expected "${targetKey}" to be a "number" got "${typeof inputValue}"`)
			}
			break
		}
		default:
			break
		}
	}

	if (invalidTypes.length > 0) {
		return `[${commandName}] invalid arguments provided: ${invalidTypes.join(", ")}`
	}

	return ""
}

export class Heap implements Allocator {
	malloc = malloc
	calloc = calloc
	free = free
	realloc = realloc

	private wasmMemory: WebAssembly.Memory

	constructor(wasmMemory: WebAssembly.Memory) {
		this.wasmMemory = wasmMemory
	}
	
	getRawMemory(): WebAssembly.Memory {
		return this.wasmMemory
	}
}

type EcsConfig = {
    engine: ShaheenEngineImpl
}

export class EngineEcs implements EcsImpl {
	engine: ShaheenEngineImpl
	systems: Array<EcsSystemImpl>

	constructor(config: EcsConfig) {
		this.engine = config.engine
		this.systems = []
	}
    
    
	addSystem(system: EcsSystemImpl): number {
		this.systems.push(system)
		return this.systems.length - 1
	}

	step(): number {
		const {systems, engine} = this
		const len = systems.length
		for (let i = 0; i < len; i++) {
			const system = systems[i]
			system(engine)
		}
		return 0
	}
}

export const MAIN_THREAD_ID = 0

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement
	wasmHeap: Heap
	threadId: number
}

export const NullPrototype = (function() {} as unknown as { new<T extends object = object>(): T})
NullPrototype.prototype = null

export type CompiledState = Record<string, object>
export type CompiledResources = Record<string, Record<string, string>>
export type CompiledModMetadata = Record<string, ModMetadata>

const EMPTY_OBJECT = {}

export class Engine extends NullPrototype implements ShaheenEngineImpl {
	wasmHeap: Heap
	ecs: EngineEcs
	originTime: number
	previousFrame: number
	elapsedTime: number
	modState: CompiledState
	modResources: CompiledResources
	modMetaData: CompiledModMetadata
	isRunning: boolean
	zconsole: ConsoleCommandIndex

	// engine libraries
	readonly time: TimeUtils
	readonly threads: ThreadUtils

	private canvas: HTMLCanvasElement

	constructor(config: EngineConfig) {
		super()
		const {wasmHeap, rootCanvas, threadId} = config
		this.wasmHeap = wasmHeap
		this.isRunning = true
		const self = this
		this.modState = {}
		this.modResources = {}
		this.modMetaData = {}
		this.originTime = 0.0
		this.previousFrame = 0.0
		this.elapsedTime = 0.0
		this.canvas = rootCanvas
		this.zconsole = Object.create(null)
		this.time = {
			originTime: () => self.originTime,
			previousFrameTime: () => self.previousFrame,
			totalElapsedTime: () => (self.previousFrame - self.originTime) + self.elapsedTime
		}
		this.threads = {
			isMainThread: () => threadId === MAIN_THREAD_ID,
			threadId: () => MAIN_THREAD_ID
		}
		this.ecs = new EngineEcs({engine: self})
	}

	addConsoleCommand<
		Args extends ConsoleCommandInputDeclaration
	>(command: ModConsoleCommand<Engine, Args>): void {
		const {name, args, fn} = command
		Object.defineProperty(fn, "name", {
			value: name,
			enumerable: true,
			configurable: true,
			writable: false
		})
		const self = this
		const commandArgs = args || EMPTY_OBJECT
		Object.defineProperty(this.zconsole, name, {
			value: (input: Record<string, string | boolean | number | undefined> = {}) => {
				if (
					typeof input === "object" 
					&& input !== null
					&& input.args
				) {
					console.info(`[${name}] arguments`, args)
					return "ok"
				}
				const validateResponse = validateCommandInput(commandArgs, input, name)
				if (validateResponse.length > 0) {
					console.error(validateResponse)
					return "error"
				}
				const response = fn(
					self, 
					input as ParsedConsoleCommandInput<NonNullable<typeof args>>
				) 
				return response || "ok"
			},
			enumerable: true,
			configurable: true,
			writable: false
		})
	}

	getRootCanvas(): HTMLCanvasElement {
		return this.canvas
	}

	getDeltaTime(): number {
		return this.elapsedTime
	}

	state(): CompiledState {
		return this.modState
	}

	resouces(): CompiledResources {
		return this.modResources
	}

	metadata(): CompiledModMetadata {
		return this.modMetaData
	}
}