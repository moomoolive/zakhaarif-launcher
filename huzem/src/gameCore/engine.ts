import type {
	Allocator,
	ConsoleCommandIndex,
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
	ModConsoleCommand,
	ShaheenEngine
} from "zakhaarif-dev-tools"
import {CompiledMod} from "./lib/mods/compiledMod"
import {validateCommandInput} from "./lib/cli/parser"
import {EcsCore} from "./lib/ecs/ecsCore"
import {NullPrototype} from "./lib/utils/nullProto"
import {Archetype} from "./lib/mods/archetype"
import {wasmMap} from "../wasmBinaryPaths.mjs"
import {WasmHeap} from "./lib/heap/wasmHeap"
import initHeap from "./engine_allocator/pkg/engine_allocator"
import nodeHeap from "./engine_allocator/pkg-node/engine_allocator.js"

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
	threadedMode: boolean
}

export class Engine extends NullPrototype implements ShaheenEngine {
	static async init(config: Omit<EngineConfig, "wasmHeap">): Promise<Engine> {
		const isRunningInNode = typeof window === "undefined"
		if (isRunningInNode) {
			const wasmHeap = new WasmHeap({
				...nodeHeap, memory: nodeHeap.__wasm.memory
			})
			return new Engine({...config, wasmHeap})
		}
		const relativeUrl = wasmMap.engine_allocator
		const heapUrl = new URL(relativeUrl, import.meta.url).href
		const innerHeap = await initHeap(heapUrl)
		const wasmHeap = new WasmHeap(innerHeap)
		return new Engine({wasmHeap, ...config})
	}
	
	wasmHeap: Allocator
	ecs: EcsCore
	originTime: number
	previousFrame: number
	elapsedTime: number
	isRunning: boolean
	console: ConsoleCommandIndex
	compiledMods: CompiledMods
	archetypes: Archetype[]

	readonly currentThreadId: number

	private canvas: HTMLCanvasElement

	constructor(config: EngineConfig) {
		super()
		const {wasmHeap, rootCanvas, threadId} = config
		this.currentThreadId = threadId
		this.archetypes = []
		this.wasmHeap = wasmHeap
		this.isRunning = false
		this.console = nullObject()
		this.compiledMods = nullObject()
		this.originTime = 0.0
		this.previousFrame = 0.0
		this.elapsedTime = 0.0
		this.canvas = rootCanvas
		const self = this
		this.ecs = new EcsCore({engine: self})
	}

	isMainThread(): boolean {
		return this.currentThreadId === MAIN_THREAD_ID
	}

	threadId(): number {
		return this.currentThreadId
	}

	getOriginTime(): number {
		return this.originTime
	}

	getPreviousFrameTime(): number {
		return this.previousFrame
	}

	getTotalElapsedTime(): number {
		return (this.previousFrame - this.originTime) + this.elapsedTime
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
		Object.defineProperty(this.console, name, {
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