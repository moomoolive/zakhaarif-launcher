import type {
	Allocator,
	ConsoleCommandIndex,
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
	ModConsoleCommand,
	MainThreadEngine,
	LinkableMod,
	ModMetadata,
	ComponentClass,
	ComponentMetadata,
	MetaUtilityLibrary,
	EcsSystem,
	EcsSystemManager,
	ConsoleCommandManager,
	MainThreadStandardLibrary,
} from "zakhaarif-dev-tools"
import {CompiledMod} from "../mods/compiledMod"
import {validateCommandInput} from "./console"
import {NullPrototype, nullObject} from "../utils/nullProto"
import {Archetype} from "../mods/archetype"
import {wasmMap} from "../../../wasmBinaryPaths.mjs"
import {WasmAllocatorConfig, WasmAllocator} from "../wasm/allocator"
import initEngineApis from "../../engine_wasm_core/pkg/engine_wasm_core"
import {validateMod} from "./validateMod"
import {EnumMember, defineEnum} from "../utils/enum"
import {compileComponentClass} from "../mods/componentView"
import {MainStandardLib, MAIN_THREAD_ID} from "./standardLibrary"
import * as stdlib from "zakhaarif-dev-tools/std"

type NodeEngineApis = typeof import("../../engine_wasm_core/pkg-node/engine_wasm_core.js")

class EngineCompilers extends NullPrototype {
	readonly ecsComponent = compileComponentClass
}

const ENGINE_CODES = defineEnum(
	["ok", 0],
	["mod_package_invalid_type", 1_000],
	["mod_init_hook_failed", 1_001],
	["mod_js_state_init_failed", 1_002],
	["mod_before_event_loop_failed", 1_002],
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

export type DomState = {
	rootCanvas: HTMLCanvasElement | null
	rootElement: HTMLElement | null
}

export type ThreadMeta = {
	activeOsThreads: number
}

export type TimeState = {
	originTime: number
	previousFrame: number
	elapsedTime: number
}

type CompiledMods = {
	readonly [key: string]: CompiledMod
}

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement | null
    rootElement: HTMLElement | null
	wasmHeap: Allocator
	threadedMode: boolean
}

export class MainEngine extends NullPrototype implements MainThreadEngine {
	static async init(config: Omit<EngineConfig, "wasmHeap">): Promise<MainEngine> {
		const isRunningInNode = (
			typeof global !== "undefined"
			&& typeof require === "function"
		)
		if (isRunningInNode) {
			const nodeEngineApis: NodeEngineApis = require("../../engine_wasm_core/pkg-node/engine_wasm_core.js") // eslint-disable-line @typescript-eslint/no-var-requires
			type NodeAllocatorApis = NodeEngineApis & WasmAllocatorConfig
			const wasmHeap = new WasmAllocator({
				...nodeEngineApis, 
				memory: nodeEngineApis.__wasm.memory
			} as NodeAllocatorApis)
			return new MainEngine({...config, wasmHeap})
		}
		const relativeUrl = wasmMap.engine_wasm_core
		const binaryUrl = new URL(relativeUrl, import.meta.url).href
		const webEngineApis = await initEngineApis(binaryUrl)
		type WebAlloctorApis = typeof webEngineApis & WasmAllocatorConfig
		const wasmHeap = new WasmAllocator(
			webEngineApis as WebAlloctorApis
		)
		return new MainEngine({wasmHeap, ...config})
	}

	static readonly MAIN_THREAD_ID = MAIN_THREAD_ID
	static readonly STATUS_CODES = ENGINE_CODES
	
	mods: CompiledMods = nullObject()
	meta: MetaIndex = new MetaIndex()
	isRunning = false
	gameLoopHandler = (_: number) => {}
	archetypes: Archetype[] = []
	systems: SystemManager = new SystemManager()
	readonly compilers: EngineCompilers = new EngineCompilers()
	
	wasmHeap: Allocator
	std: MainThreadStandardLibrary
	devConsole: ConsoleCommands

	private modIdCounter = 0
	private componentIdCounter = 0

	/** Dom related stuff, will be null if running in Node (or Deno) */
	private domState: DomState
	private timeState: TimeState
	private threadState: ThreadMeta

	constructor(config: EngineConfig) {
		super()
		const {wasmHeap, rootCanvas, rootElement} = config
		const threadId = MAIN_THREAD_ID
		this.wasmHeap = wasmHeap
		this.devConsole = new ConsoleCommands(this)
		this.domState = {rootElement, rootCanvas}
		this.threadState = {activeOsThreads: 1}
		this.timeState = {
			originTime: 0.0,
			previousFrame: 0.0,
			elapsedTime: 0.0,
		}
		const mainThreadLib = new MainStandardLib({
			domElements: this.domState, 
			threadId,
			threadMeta: this.threadState,
			time: this.timeState
		})
		this.std = {...mainThreadLib, ...stdlib}
	}

	runFrameTasks(currentTime: number): number {
		this.timeState.elapsedTime = currentTime - this.timeState.previousFrame
		this.timeState.previousFrame = currentTime
		return this.systems.run(this)
	}

	ignite(currentTime: number): EngineCode {
		this.timeState.originTime = currentTime
		this.timeState.previousFrame = currentTime
		this.isRunning = true
		return ENGINE_CODES.ok
	}

	async linkMods(mods: ModLinkInfo[]): Promise<ModLinkStatus> {
		const linkStatus: ModLinkStatus = {
			errors: [],
			warnings: [],
			ok: true,
			linkCount: 0
		}

		const typeCheckErrors = []
		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i]
			// some kind of light type check on
			// mods, components, state, & archetypes
			const {wrapper, canonicalUrl} = mod
			const {ok, error} = validateMod(wrapper)
			if (ok) {
				continue
			}
			typeCheckErrors.push(`mod ${canonicalUrl} is not typed correctly ${error}`)
		}

		if (typeCheckErrors.length > 0) {
			linkStatus.ok = false
			const messages = typeCheckErrors.map((msg) => {
				return {msg, ...ENGINE_CODES.mod_package_invalid_type}
			})
			linkStatus.errors.push(...messages)
			return linkStatus
		}

		// compile metadata for all mods
		const modMetas: ModMetadata[] = []
		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i]
			const {wrapper, resolvedUrl, canonicalUrl, semver} = mod
			this.meta.modVersionIndex.set(wrapper.data.name, semver)
			const {data} = wrapper
			const id = this.modIdCounter++
			const meta: ModMetadata = {
				name: data.name,
				canonicalUrl,
				resolvedUrl,
				dependencies: data.dependencies || [],
				id 
			}
			modMetas.push(meta)
		}

		// lifecycle hook 1 => init hook
		// runs all init hooks in parellel.
		// This works because init hooks should not require
		// any dependencies to run
		const engine = this
		const initErrors: string[] = []
		await Promise.all(mods.map(async (mod, index) => {
			const {wrapper} = mod
			if (!wrapper.onInit) {
				return
			}
			const meta = modMetas[index]
			try {
				await wrapper.onInit(meta, engine)
			} catch (err) {
				console.error("mod", meta.canonicalUrl, "threw exception in init hook", err)
				initErrors.push(`mod ${meta.canonicalUrl} threw exception in init hook ${String(err)}`)
			}
		}))

		if (initErrors.length > 0) {
			linkStatus.ok = false
			const messages = initErrors.map((msg) => {
				return {msg, ...ENGINE_CODES.mod_init_hook_failed}
			})
			linkStatus.errors.push(...messages)
			return linkStatus
		}

		// lifecycle hook 2 => js state hook
		// initializes all states in parellel. 
		// Same reason as init hook, see above
		const jsStateErrors: string[] = []
		const jsStatesAsync = mods.map(async (mod, index) => {
			const {data} = mod.wrapper
			const response = {ok: true, state: {}, msg: ""}
			if (!data.state) {
				return {}
			}
			const meta = modMetas[index]
			try {
				return await data.state(meta, engine)
			} catch (err) {
				console.error("mod", meta.canonicalUrl, "threw exception during js state initialization", err)
				response.ok = false
				jsStateErrors.push(`mod ${meta.canonicalUrl} threw exception during js state initialization ${String(err)}`)
				return {}
			}
		})
		const jsStates = await Promise.all(jsStatesAsync)

		if (jsStateErrors.length > 0) {
			linkStatus.ok = false
			const messages = jsStateErrors.map((msg) => {
				return {msg, ...ENGINE_CODES.mod_js_state_init_failed}
			})
			linkStatus.errors.push(...messages)
			return linkStatus
		}
		
		const modsCompiled = nullObject<CompiledMods>()
		for (let m = 0; m < mods.length; m++) {
			const mod = mods[m]
			const {wrapper} = mod
			const meta = modMetas[m]
			const modState = jsStates[m]

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

			const compiled = new CompiledMod({
				state: modState,
				meta,
				resources: (wrapper.data.resources || {}) as Record<string, string>,
				// TODO: queries
				queries: {},
				componentClasses,
				// TODO: archetypes
				archetypes: {}
			})
            
			Object.defineProperty(modsCompiled, wrapper.data.name, {
				configurable: true,
				enumerable: true,
				writable: false,
				value: compiled
			})
		}
		this.mods = modsCompiled

		// lifecycle hook 3 => before game loop hook
		// cannot run in parellel because mods can be
		// dependant on other mods here.
		// TODO: determine mod order (based on dependencies)
		const beforeGameLoopErrors = []
		for (let i = 0; i < mods.length; i++) {
			const {wrapper} = mods[i]
			if (!wrapper.onBeforeGameLoop) {
				continue
			}
			try {
				await wrapper.onBeforeGameLoop(this)
			} catch (err) {
				const meta = modMetas[i]
				console.error("mod", meta.canonicalUrl, "threw exception during before game loop event", err)
				beforeGameLoopErrors.push(`mod ${meta.canonicalUrl} threw exception during before game loop event ${String(err)}`)
			}
		}

		if (beforeGameLoopErrors.length > 0) {
			linkStatus.ok = false
			const messages = beforeGameLoopErrors.map((msg) => {
				return {msg, ...ENGINE_CODES.mod_before_event_loop_failed}
			})
			linkStatus.errors.push(...messages)
			return linkStatus
		}

		return linkStatus
	}
}

export class MetaIndex extends NullPrototype implements MetaUtilityLibrary {
	modVersionIndex: Map<string, string>
	componentIndex: Map<string, ComponentClass>
    
	constructor() {
		super()
		this.modVersionIndex = new Map()
		this.componentIndex = new Map()
	}

	getModVersion(modName: string): string {
		return this.modVersionIndex.get(modName) || ""
	}

	getComponentMeta(componentName: string): ComponentMetadata | null {
		return this.componentIndex.get(componentName) || null
	}
}

export class ConsoleCommands extends NullPrototype implements ConsoleCommandManager {
	index: ConsoleCommandIndex = nullObject()
	private engineRef: MainThreadEngine
	
	constructor(engine: MainThreadEngine) {
		super()
		this.engineRef = engine
	}

	addCommand<Args extends ConsoleCommandInputDeclaration>(
		command: ModConsoleCommand<MainThreadEngine, Args>
	): void {
		const {name, args, fn} = command
		Object.defineProperty(fn, "name", {
			value: name,
			enumerable: true,
			configurable: true,
			writable: false
		})
		const self = this.engineRef
		const commandArgs = args || {}
		Object.defineProperty(this.index, name, {
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
}

export class SystemManager extends NullPrototype implements EcsSystemManager {
	systems: Array<EcsSystem>

	constructor() {
		super()
		this.systems = []
	}
    
	add(system: EcsSystem): number {
		this.systems.push(system)
		return this.systems.length - 1
	}

	run(engine: MainThreadEngine): number {
		const {systems} = this
		const len = systems.length
		for (let i = 0; i < len; i++) {
			const system = systems[i]
			system(engine)
		}
		return 0
	}
}