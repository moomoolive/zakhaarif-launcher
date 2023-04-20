import type {
	Allocator,
	ConsoleCommandIndex,
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
	ModConsoleCommand,
	ShaheenEngine,
	LinkableMod,
} from "zakhaarif-dev-tools"
import {CompiledMod} from "../mods/compiledMod"
import {validateCommandInput} from "../cli/parser"
import {EcsCore} from "../ecs/ecsCore"
import {NullPrototype, nullObject} from "../utils/nullProto"
import {Archetype} from "../mods/archetype"
import {wasmMap} from "../../../wasmBinaryPaths.mjs"
import {WasmHeap} from "../heap/wasmHeap"
import initWebHeap from "../../engine_allocator/pkg/engine_allocator"
import {validateMod} from "./validateMod"
import {defineEnum} from "../utils/enum"

const MAIN_THREAD_ID = 0

const ENGINE_ERRORS = defineEnum(
	["mod_package_invalid_type", 1_000],
)

type ModLinkStatus = {
	errors: {msg: string, status: number, statusText: string}[]
	warnings: {msg: string, status: number, statusText: string}[]
	ok: boolean
	linkCount: number
}

export type ModLinkInfo = {
	wrapper: LinkableMod,
	resolvedUrl: string,
	canonicalUrl: string
}

type CompiledMods = {
	readonly [key: string]: CompiledMod
}

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement | null
	wasmHeap: Allocator
	threadId: number
	threadedMode: boolean
}

export class Engine extends NullPrototype implements ShaheenEngine {
	static async init(config: Omit<EngineConfig, "wasmHeap">): Promise<Engine> {
		const isRunningInNode = (
			typeof window === "undefined"
			&& typeof require === "function"
		)
		if (isRunningInNode) {
			const nodeHeap = require("./engine_allocator/pkg-node/engine_allocator.js") // eslint-disable-line @typescript-eslint/no-var-requires
			const wasmHeap = new WasmHeap({
				...nodeHeap, memory: nodeHeap.__wasm.memory
			})
			return new Engine({...config, wasmHeap})
		}
		const relativeUrl = wasmMap.engine_allocator
		const heapUrl = new URL(relativeUrl, import.meta.url).href
		const innerHeap = await initWebHeap(heapUrl)
		const wasmHeap = new WasmHeap(innerHeap)
		return new Engine({wasmHeap, ...config})
	}

	static readonly MAIN_THREAD_ID = MAIN_THREAD_ID
	
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

	// will be null if running in Node (or Deno...)
	private canvas: HTMLCanvasElement | null
	private linkedMods: ModLinkInfo[]

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
		this.linkedMods = []
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
		const commandArgs = args || {}
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

	getRootCanvas(): HTMLCanvasElement | null {
		return this.canvas
	}

	getDeltaTime(): number {
		return this.elapsedTime
	}

	useMod(): CompiledMods {
		return this.compiledMods
	}

	async linkMods(mods: ModLinkInfo[]) {
		const modBuffer: CompiledMod[] = []

		const linkStatus: ModLinkStatus = {
			errors: [],
			warnings: [],
			ok: true,
			linkCount: 0
		}

		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i]
			const {wrapper, canonicalUrl} = mod
			const {ok, error} = validateMod(wrapper)
			if (!ok) {
				linkStatus.ok = false
				linkStatus.errors.push({
					msg: `[pkg => ${canonicalUrl}] ${error}`,
					...ENGINE_ERRORS[0]
				})
				continue
			}
		}

		if (!linkStatus.ok) {
			return linkStatus
		}

		// some kind of type check on
		// mods, components, state, & archetypes

		const modCount = this.linkedMods.length
		
		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i]
			const {wrapper, resolvedUrl, canonicalUrl} = mod
			const {data} = wrapper
			const id = modCount + i
			const compiled = new CompiledMod({
				state: {},
				meta: {
					name: data.name,
					canonicalUrl,
					resolvedUrl,
					dependencies: data.dependencies || [],
					id 
				},
				resources: {},
				queries: {},
				componentClasses: {},
				archetypes: {}
			})
			modBuffer.push(compiled)
		}

		return linkStatus
	}
}