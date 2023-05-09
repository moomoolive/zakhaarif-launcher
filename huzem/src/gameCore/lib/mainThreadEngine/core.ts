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
	ConsoleCommandManager,
	MainThreadStandardLibrary,
} from "zakhaarif-dev-tools"
import {CompiledMod} from "../mods/compiledMod"
import {validateCommandInput} from "./console"
import {NullPrototype, nullObject} from "../utils/nullProto"
import {Archetype} from "../mods/archetype"
//import {compileComponentClass} from "../mods/componentView"
import {MainStandardLib, MAIN_THREAD_ID} from "./standardLibrary"
import {ModLinkStatus, lifecycle} from "./lifecycle"
import {ENGINE_CODES, EngineCode} from "./status"
import {SystemManager} from "./systems"

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
	static readonly MAIN_THREAD_ID = MAIN_THREAD_ID
	static readonly STATUS_CODES = ENGINE_CODES
	
	mods = nullObject<CompiledMods>()
	isRunning = false
	gameLoopHandler = (_: number) => {}
	archetypes = <Archetype[]>[]
	systems = new SystemManager()
	meta = {
		modVersionIndex: new Map<string, string>(),
		componentIndex: new Map<string, ComponentClass>(),
		getModVersion(modName: string): string {
			return this.modVersionIndex.get(modName) || ""
		},
		getComponentMeta(componentName: string): ComponentMetadata | null {
			return this.componentIndex.get(componentName) || null
		}
	}
	
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
		this.wasmHeap = wasmHeap
		this.devConsole = new ConsoleCommands(this)
		this.domState = {rootElement, rootCanvas}
		this.threadState = {activeOsThreads: 1}
		this.timeState = {
			originTime: 0.0,
			previousFrame: 0.0,
			elapsedTime: 0.0,
		}
		this.std = new MainStandardLib({
			domElements: this.domState, 
			threadId: MAIN_THREAD_ID,
			threadMeta: this.threadState,
			time: this.timeState
		})
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
		const typecheck = lifecycle.typeCheck(mods)
		if (!typecheck.ok) {
			return typecheck
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

		const init = await lifecycle.init(mods, modMetas, this)
		if (!init.ok) {
			return init
		}

		const jsState = await lifecycle.jsStateInit(mods, modMetas, this)
		if (!jsState.status.ok) {
			return jsState.status
		}
		const {data: jsStates} = jsState
		
		const modsCompiled = nullObject<CompiledMods>()
		for (let m = 0; m < mods.length; m++) {
			const mod = mods[m]
			const {wrapper} = mod
			const meta = modMetas[m]
			const modState = jsStates[m]

			const compiled = new CompiledMod({
				state: modState,
				meta,
				resources: (wrapper.data.resources || {}) as Record<string, string>,
				// TODO: queries
				queries: {},
				// TODO: classes? should this even be accessable
				componentClasses: {},
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

		const beforeloop = await lifecycle.beforeGameloop(mods, this)
		if (!beforeloop.ok) {
			return beforeloop
		}

		const okLinkStatus = new ModLinkStatus()
		okLinkStatus.linkCount = mods.length
		return okLinkStatus
	}
}

class ConsoleCommands extends NullPrototype implements ConsoleCommandManager {
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
