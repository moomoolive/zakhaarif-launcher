import type {
	Allocator,
	ConsoleCommandIndex,
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
	ModConsoleCommand,
	ShaheenEngine,
	LinkableMod,
	ModMetadata,
	ComponentClass,
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
import {EnumMember, defineEnum} from "../utils/enum"
import {compileComponentClass} from "../mods/componentView"
import {MetaIndex} from "./meta"
import {MAIN_THREAD_ID} from "./thread"
import {StandardLib} from "./standardLibrary"

class EngineCompilers extends NullPrototype {
	readonly ecsComponent = compileComponentClass
}

const ENGINE_CODES = defineEnum(
	["ok", 0],
	["mod_package_invalid_type", 1_000],
)

export type EngineCode = EnumMember<typeof ENGINE_CODES>

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
    entryUrl: string
	semver: string
}

type CompiledMods = {
	readonly [key: string]: CompiledMod
}

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement | null
    rootElement: HTMLElement | null
	wasmHeap: Allocator
	threadId: number
	threadedMode: boolean
}

export class Engine extends NullPrototype implements ShaheenEngine {
	static async init(config: Omit<EngineConfig, "wasmHeap">): Promise<Engine> {
		const isRunningInNode = (
			typeof global !== "undefined"
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
	static readonly STATUS_CODES = ENGINE_CODES
	
	wasmHeap: Allocator
	ecs: EcsCore
	originTime: number
	previousFrame: number
	elapsedTime: number
	isRunning: boolean
	console: ConsoleCommandIndex
	compiledMods: CompiledMods
	archetypes: Archetype[]
	
	meta: MetaIndex
	readonly compilers: EngineCompilers
	readonly std: StandardLib

	private linkedMods: ModLinkInfo[]
	private modIdCounter: number
	private componentIdCounter: number

	// Dom related stuff
	// will be null if running in Node (or Deno)
	private canvas: HTMLCanvasElement | null
	private rootElement: HTMLElement | null

	constructor(config: EngineConfig) {
		super()
		const {wasmHeap, rootCanvas, threadId, rootElement} = config
		this.archetypes = []
		this.wasmHeap = wasmHeap
		this.isRunning = false
		this.console = nullObject()
		this.compiledMods = nullObject()
		this.originTime = 0.0
		this.previousFrame = 0.0
		this.elapsedTime = 0.0
		this.canvas = rootCanvas
		this.rootElement = rootElement
		this.linkedMods = []
		this.modIdCounter = 0
		this.componentIdCounter = 0
		this.meta = new MetaIndex()
		this.std = new StandardLib({threadId})
		this.compilers = new EngineCompilers()
		this.ecs = new EcsCore()
	}

	runFrameTasks(currentTime: number): number {
		this.elapsedTime = currentTime - this.previousFrame
		this.previousFrame = currentTime
		return this.ecs.step(this)
	}

	ignite(currentTime: number): EngineCode {
		this.originTime = currentTime
		this.previousFrame = currentTime
		this.isRunning = true
		return ENGINE_CODES.ok
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

	getRootDomElement(): HTMLElement | null {
		return this.rootElement
	}

	getDeltaTime(): number {
		return this.elapsedTime
	}

	useMod(): CompiledMods {
		return this.compiledMods
	}

	async linkMods(mods: ModLinkInfo[]): Promise<ModLinkStatus> {
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
					...ENGINE_CODES.mod_package_invalid_type
				})
				continue
			}
		}

		if (!linkStatus.ok) {
			return linkStatus
		}

		// some kind of type check on
		// mods, components, state, & archetypes

		for (let i = 0; i < mods.length; i++) {
			const {wrapper, semver} = mods[i]
			this.meta.modVersionIndex.set(wrapper.data.name, semver)
		}
		
		for (let m = 0; m < mods.length; m++) {
			const mod = mods[m]
			const {wrapper, resolvedUrl, canonicalUrl} = mod
			const {data} = wrapper
			const id = this.modIdCounter++
			const meta: ModMetadata = {
				name: data.name,
				canonicalUrl,
				resolvedUrl,
				dependencies: data.dependencies || [],
				id 
			}
			const engine = this
			if (wrapper.onInit) {
				await wrapper.onInit(meta, engine)
			}

			let modState = {}
			if (wrapper.data.state) {
				modState = await wrapper.data.state(meta, this)
			}

			const componentClasses: Record<string, ComponentClass> = Object.create(null)
			const components = wrapper.data.components || {}
			const componentNames = Object.keys(components)
			for (let i = 0; i < componentNames.length; i++) {
				const componentName = componentNames[i]
				const definition = components[componentName]
				const fullname = `${wrapper.data.name}_${componentName}`
				const componentId = this.componentIdCounter++
				const compilerResponse = this.compilers.ecsComponent(
					componentName,
					definition,
					fullname,
					componentId
				)
				if (!compilerResponse.ok) {
					console.warn(`couldn't compiled component "${fullname}": ${compilerResponse.msg}`)
					continue
				}
				Object.defineProperty(componentClasses, componentName, {
					value: compilerResponse.componentClass,
					enumerable: true,
					writable: true,
					configurable: true
				})
				this.meta.componentIndex.set(fullname, compilerResponse.componentClass)
			}

			const modArchetypes = wrapper.data.archetypes || {}
			const archetypes = {}
			const archetypeKeys = Object.keys(modArchetypes)
			for (let i = 0; i < archetypeKeys.length; i++) {
				const key = archetypeKeys[i]
				Object.defineProperty(archetypes, key, {
					value: {},
					enumerable: true,
					writable: true,
					configurable: true
				})
			}

			const queries = wrapper.data.queries || {}
			const definedQueries = Object.keys(queries)
			const queryAccessors = {}
			for (let i = 0; i < definedQueries.length; i++) {
				const queryname = definedQueries[i]
				Object.defineProperty(queryAccessors, queryname, {
					configurable: true,
					enumerable: true,
					writable: true,
					value: () => ({})
				})
			}

			const compiled = new CompiledMod({
				state: modState,
				meta,
				resources: (wrapper.data.resources || {}) as Record<string, string>,
				queries: queryAccessors,
				componentClasses,
				archetypes
			})
            
			Object.defineProperty(this.compiledMods, wrapper.data.name, {
				configurable: true,
				enumerable: true,
				writable: false,
				value: compiled
			})

			if (wrapper.onBeforeGameLoop) {
				await wrapper.onBeforeGameLoop(engine)
			}

			modBuffer.push(compiled)
		}

		return linkStatus
	}
}