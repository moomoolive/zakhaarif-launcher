import type {
	Allocator,
	ConsoleCommandIndex,
	ConsoleCommandInputDeclaration,
	ModConsoleCommand,
	MainThreadEngine,
	LinkableMod,
	ComponentClass,
	ComponentMetadata,
	ConsoleCommandManager,
	MainThreadStandardLibrary,
	ModMetadata,
	ArchetypeAccessor,
	QueryAccessor
} from "zakhaarif-dev-tools"
import {CompiledMod} from "../mods/compiledMod"
import {createCommand} from "./console"
import {Null} from "../utils"
import {Archetype} from "../mods/archetype"
import {MainStandardLib, MAIN_THREAD_ID} from "./standardLibrary"
import {SystemManager} from "./systems"
import {WasmCoreApis} from "../wasm/coreTypes"
import {WasmAllocatorConfig, WasmAllocator} from "../wasm/allocator"

export type ModLinkInfo = {
	wrapper: LinkableMod,
	resolvedUrl: string,
	canonicalUrl: string
    entryUrl: string
	semver: string
}

export const ENGINE_CODES = {
	ok: 0,
	mod_before_event_loop_failed: 100,
	mod_js_state_init_failed: 101,
	mod_init_hook_failed: 102,
	mod_package_invalid_type: 103,
} as const

export type EngineCode = typeof ENGINE_CODES[keyof typeof ENGINE_CODES]
export type EngineStatusText = keyof typeof ENGINE_CODES

export type EngineConfig = {
    rootCanvas?: HTMLCanvasElement | null
    rootElement?: HTMLElement | null
	threadedMode?: boolean

	coreBinary: WebAssembly.Module
	coreInstance: WebAssembly.Instance
	wasmMemory: WebAssembly.Memory
}

export class MainEngine extends Null implements MainThreadEngine {
	static readonly MAIN_THREAD_ID = MAIN_THREAD_ID
	static readonly STATUS_CODES = ENGINE_CODES
	
	mods = new Null<{readonly [key: string]: CompiledMod}>()
	isRunning = false
	gameLoopHandler = (_delta: number) => {}
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
	devConsole = (<T extends ConsoleCommandManager>(m: T) => m)({
		index: new Null<ConsoleCommandIndex>(),
		engine: <MainEngine>this,
		addCommand<T extends ConsoleCommandInputDeclaration>(
			cmd: ModConsoleCommand<MainThreadEngine, T>
		) { createCommand(this.engine, this.index, cmd) }
	})

	binary: {
		coreInstance: WebAssembly.Instance
		coreBinary: WebAssembly.Module
	}
	wasmHeap: Allocator
	std: MainThreadStandardLibrary

	private threadState = {activeOsThreads: 1}
	private timeState = {
		originTime: 0.0,
		previousFrame: 0.0,
		elapsedTime: 0.0,
	}
	/** Dom related stuff, will be null if running in Node (or Deno) */
	private domState: {
		rootCanvas: HTMLCanvasElement | null
		rootElement: HTMLElement | null
	}
	
	constructor(config: EngineConfig) {
		super()
		const coreApis = config.coreInstance.exports as WasmCoreApis
		this.wasmHeap = new WasmAllocator(
			config.wasmMemory, coreApis as (
				WasmCoreApis & WasmAllocatorConfig
			)
		)
		this.domState = {
			rootElement: config.rootElement || null, 
			rootCanvas: config.rootCanvas || null
		}
		this.binary = {
			coreBinary: config.coreBinary,
			coreInstance: config.coreInstance
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

	async linkMods(inputMods: ModLinkInfo[]): Promise<ModLinkStatus> {
		const linkResponse: ModLinkStatus = {ok: true, errors: []}

		{ 	// Type check mod objects. 
			// Light type-checking to avoid increasing startup 
			// time significantly. Is this kinda unsafe?
			// Yeah, but mods should be leveraging typescript
			// (not recommended to write mods in pure js) anyhow
			// so full type-check should not be neccessary.
			const response = linkResponse
			const linkinfo = inputMods

			for (let i = 0; i < linkinfo.length; i++) {
				const mod = linkinfo[i]
				
				const {canonicalUrl} = mod
				const {ok, error} = {ok: true, error: ""}
				if (ok) {
					continue
				}
				response.ok = false
				response.errors.push({
					msg: `mod ${canonicalUrl} is not typed correctly ${error}`,
					text: "mod_package_invalid_type",
					status: ENGINE_CODES.mod_package_invalid_type
				})
			}
		}
		if (!linkResponse.ok) {
			return linkResponse
		}

		let modMetas: ModMetadata[]
		{ 	// Compile metadata for mods
			const linkinfo = inputMods
			const engine = this

			const metas: ModMetadata[] = []
			for (let i = 0; i < linkinfo.length; i++) {
				const {
					wrapper, resolvedUrl, canonicalUrl, semver
				} = linkinfo[i]
				const {data} = wrapper
				engine.meta.modVersionIndex.set(
					wrapper.data.name, semver
				)
				const id = i
				metas.push({
					name: data.name,
					canonicalUrl,
					resolvedUrl,
					dependencies: data.dependencies || [],
					id
				})
			}
			modMetas = metas
		}

		{ 	// Execute "init" lifecycle hook for all mods. 
			// Note that all hooks are run in parellel 
			// because the "init" should not require external 
			// dependencies (such as other mods) to execute.
			const response = linkResponse
			const mods = inputMods
			const metadata = modMetas
			const engine = this

			await Promise.all(mods.map(async (mod, index) => {
				const {wrapper} = mod
				if (!wrapper.onInit) {
					return
				}
				const meta = metadata[index]
				try {
					await wrapper.onInit(meta, engine)
				} catch (err) {
					console.error("mod", meta.canonicalUrl, "threw exception in init hook", err)
					response.errors.push({
						msg: `mod ${meta.canonicalUrl} threw exception in init hook ${String(err)}`,
						text: "mod_init_hook_failed",
						status: ENGINE_CODES.mod_init_hook_failed
					})
				}
			}))
		}
		if (!linkResponse.ok) {
			return linkResponse
		}

		let stateSingletons: object[]
		{	// Initialize mod state singleton for all mods.
			// Note that all singletons are initialized in parellel 
			// because the they should not require external 
			// dependencies (such as other mods) to execute.
			const status = linkResponse
			const metadata = modMetas
			const engine = this
			const mods = inputMods

			const allStates = mods.map(async (mod, index) => {
				const {data} = mod.wrapper
				const response = {ok: true, state: {}, msg: ""}
				if (!data.state) {
					return {}
				}
				const meta = metadata[index]
				try {
					return await data.state(meta, engine)
				} catch (err) {
					console.error("mod", meta.canonicalUrl, "threw exception during js state initialization", err)
					response.ok = false
					status.errors.push({
						msg: `mod ${meta.canonicalUrl} threw exception during js state initialization ${String(err)}`,
						text: "mod_js_state_init_failed",
						status: ENGINE_CODES.mod_js_state_init_failed
					})
					return {}
				}
			})
			stateSingletons = allStates
		}
		if (!linkResponse.ok) {
			return linkResponse
		}
		
		type StateRefs = {
			staticStates: object[]
			archetypes: Record<string, ArchetypeAccessor>[]
			queries: Record<string, QueryAccessor>[]
			componentIds: Record<string, number>[]
			metadatas: ModMetadata[]
			jsStates: object[]
			componentCount: number
		}
		let stateArrays: StateRefs
		{	// Create component, query, and archetype
			// accessors.
			const mods = inputMods
			const metas = modMetas
			const jsStates = stateSingletons
			
			const state: StateRefs = {
				staticStates: [],
				archetypes: [],
				queries: [],
				componentIds: [],
				metadatas: metas,
				jsStates,
				componentCount: 0
			}
			const idMeta = {
				value: 0,
				enumerable: true,
				configurable: true,
				writable: false
			}
			let id = 0
			for (let i = 0; i < mods.length; i++) {
				const mod = mods[i]
				const components = mod.wrapper.data.components || {}
				const keys = Object.keys(components)
				const componentRefs: Record<string, number> = {}
				for (let f = 0; f < keys.length; f++) {
					const name = keys[f]
					idMeta.value = id++
					Object.defineProperty(componentRefs, name, idMeta)
				}
				state.componentIds.push(componentRefs)
				state.staticStates.push({})
				state.archetypes.push({})
				state.queries.push({})
			}
			state.componentCount = id
			stateArrays = state
		}

		{	// Create mod wrappers for each mod.
			// Mods wrappers allow mods to reference each 
			// other via the "engine.mod" property - followed
			// by the mods name. Wrappers allow access to a mod's
			// state singleton, queries, etc.
			// For example, if a mod is named
			// "mycoolcats" accessing the mod is as easy as
			// "engine.mod.mycoolcats". 
			const mods = inputMods
			const engine = this
			const stateRef = stateArrays

			const modIndex = new Null<MainEngine["mods"]>()
			for (let i = 0; i < mods.length; i++) {
				const mod = mods[i]
				const {wrapper} = mod
				const compiledMod = new CompiledMod({
					state: stateRef.jsStates[i],
					meta: stateRef.metadatas[i],
					resources: (wrapper.data.resources || {}) as Record<string, string>,
					queries: stateRef.queries[i],
					archetypes: stateRef.archetypes[i],
					componentIds: stateRef.componentIds[i]
				})
				
				Object.defineProperty(modIndex, wrapper.data.name, {
					configurable: true,
					enumerable: true,
					writable: false,
					value: compiledMod
				})
			}
			engine.mods = modIndex
		}

		{ 	// Execute "beforeGameLoop" lifecycle event.
			// May or may not be run in parellel we will see?
			// For now all hooks run serially.
			const mods = inputMods
			const engine = this
			const response = linkResponse

			for (let i = 0; i < mods.length; i++) {
				const {wrapper} = mods[i]
				if (!wrapper.onBeforeGameLoop) {
					continue
				}
				try {
					await wrapper.onBeforeGameLoop(engine)
				} catch (err) {
					const meta = mods[i]
					console.error("mod", meta.canonicalUrl, "threw exception during before game loop event", err)
					response.errors.push({
						msg: `mod ${meta.canonicalUrl} threw exception during before game loop event ${String(err)}`,
						text: "mod_before_event_loop_failed",
						status: ENGINE_CODES.mod_before_event_loop_failed
					})
				}
			}
		}

		return linkResponse
	}
}

type ModLinkStatus = {
	errors: {
		msg: string 
		text: EngineStatusText 
		status: EngineCode
	}[]
	ok: boolean
}
