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
} from "zakhaarif-dev-tools"
import {CompiledMod} from "../mods/compiledMod"
import {createCommand} from "./console"
import {NullPrototype, nullObject} from "../utils/nullProto"
import {Archetype} from "../mods/archetype"
import {MainStandardLib, MAIN_THREAD_ID} from "./standardLibrary"
import {ModLinkStatus, lifecycle} from "./lifecycle"
import {ENGINE_CODES, EngineCode} from "./status"
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

export type CompiledMods = {
	readonly [key: string]: CompiledMod
}

type AllocatorApis = WasmCoreApis & WasmAllocatorConfig

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement | null
    rootElement: HTMLElement | null
	coreApis: WasmCoreApis,
	coreBinary: WebAssembly.Module
	coreInstance: WebAssembly.Instance
	wasmMemory: WebAssembly.Memory
	threadedMode: boolean
}

export class MainEngine extends NullPrototype implements MainThreadEngine {
	static readonly MAIN_THREAD_ID = MAIN_THREAD_ID
	static readonly STATUS_CODES = ENGINE_CODES
	
	mods = nullObject<{ readonly [key: string]: CompiledMod }>()
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
	devConsole = (<T extends ConsoleCommandManager>(m: T) => m)({
		index: nullObject<ConsoleCommandIndex>(),
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

	/** Dom related stuff, will be null if running in Node (or Deno) */
	private domState: DomState
	private timeState: TimeState
	private threadState: ThreadMeta

	constructor(config: EngineConfig) {
		super()
		this.wasmHeap = new WasmAllocator(
			config.wasmMemory, 
			config.coreApis as AllocatorApis
		)
		this.domState = {
			rootElement: config.rootElement, 
			rootCanvas: config.rootCanvas
		}
		this.threadState = {activeOsThreads: 1}
		this.binary = {
			coreBinary: config.coreBinary,
			coreInstance: config.coreInstance
		}
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

		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i]
			this.meta.modVersionIndex.set(mod.wrapper.data.name, mod.semver)
		}

		const modMetas = lifecycle.compileMeta(mods)

		const init = await lifecycle.init(mods, modMetas, this)
		if (!init.ok) {
			return init
		}

		const jsState = await lifecycle.jsStateInit(mods, modMetas, this)
		if (!jsState.status.ok) {
			return jsState.status
		}
		const {data: jsStates} = jsState
		
		const stateRef = lifecycle.nativeStateInit(mods, modMetas, jsStates)

		this.mods = lifecycle.compileMods(mods, stateRef)

		const beforeloop = await lifecycle.beforeGameloop(mods, this)
		if (!beforeloop.ok) {
			return beforeloop
		}

		return new ModLinkStatus({ok: true, linkCount: mods.length})
	}
}
