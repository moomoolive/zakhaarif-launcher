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
} from "zakhaarif-dev-tools/implement"
import {validateCommandInput} from "./lib/cli/parser"
import {EcsCore} from "./lib/ecs/ecsCore"

export const MAIN_THREAD_ID = 0

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement
	wasmHeap: Allocator
	threadId: number
}

export const NullPrototype = (function() {} as unknown as { new<T extends object = object>(): T})
NullPrototype.prototype = null

export type CompiledState = Record<string, object>
export type CompiledResources = Record<string, Record<string, string>>
export type CompiledModMetadata = Record<string, ModMetadata>

const EMPTY_OBJECT = {}

export class Engine extends NullPrototype implements ShaheenEngineImpl {
	wasmHeap: Allocator
	ecs: EcsCore
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
		this.ecs = new EcsCore({engine: self})
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