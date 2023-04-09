import type {
	Allocator,
	TimeUtils,
	ConsoleCommandIndex,
	ThreadUtils,
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
	ModConsoleCommand,
} from "zakhaarif-dev-tools"
import {CompiledMod} from "./lib/mods/compiledMod"
import type {
	ShaheenEngineImpl,
} from "zakhaarif-dev-tools/implement"
import {validateCommandInput} from "./lib/cli/parser"
import {EcsCore} from "./lib/ecs/ecsCore"
import {NullPrototype} from "./lib/utils/nullProto"

export const MAIN_THREAD_ID = 0

type CompiledMods = {
	readonly [key: string]: CompiledMod
}

const EMPTY_OBJECT = {}

const nullObject = <T extends object>(): T => Object.create(null)

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement
	wasmHeap: Allocator
	threadId: number
}

export class Engine extends NullPrototype implements ShaheenEngineImpl {
	wasmHeap: Allocator
	ecs: EcsCore
	originTime: number
	previousFrame: number
	elapsedTime: number
	isRunning: boolean
	zconsole: ConsoleCommandIndex
	compiledMods: CompiledMods

	// engine libraries
	readonly time: TimeUtils
	readonly threads: ThreadUtils

	private canvas: HTMLCanvasElement

	constructor(config: EngineConfig) {
		super()
		const {wasmHeap, rootCanvas, threadId} = config
		this.wasmHeap = wasmHeap
		this.isRunning = false
		this.zconsole = nullObject()
		this.compiledMods = nullObject()
		this.originTime = 0.0
		this.previousFrame = 0.0
		this.elapsedTime = 0.0
		this.canvas = rootCanvas
		const self = this
		this.ecs = new EcsCore({engine: self})
		this.time = {
			originTime: () => self.originTime,
			previousFrameTime: () => self.previousFrame,
			totalElapsedTime: () => (self.previousFrame - self.originTime) + self.elapsedTime
		}
		this.threads = {
			isMainThread: () => threadId === MAIN_THREAD_ID,
			threadId: () => MAIN_THREAD_ID
		}
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

	useMod(): CompiledMods {
		return this.compiledMods
	}
}