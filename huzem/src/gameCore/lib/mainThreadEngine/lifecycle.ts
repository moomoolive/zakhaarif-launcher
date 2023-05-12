import {
	ArchetypeAccessor,
	MainThreadEngine, 
	MainThreadEngineCore, 
	ModMetadata,
	QueryAccessor
} from "zakhaarif-dev-tools"
import type {ModLinkInfo, CompiledMods} from "./core"
import {ENGINE_CODES} from "./status"
import {validateMod} from "./validateMod"
import {nullObject} from "../utils/nullProto"
import {CompiledMod} from "../mods/compiledMod"

export class ModLinkStatus {
	errors: {msg: string, status: number, statusText: string}[]
	warnings: {msg: string, status: number, statusText: string}[]
	ok: boolean
	linkCount: number

	constructor({
		linkCount = 0,
		ok = true,
		warnings = [],
		errors = []
	}: Partial<ModLinkStatus> = {}) {
		this.linkCount = linkCount
		this.ok = ok
		this.warnings = warnings
		this.errors = errors
	}
}

export type ModLinkStatusWithPayload<T = unknown> = {
    data: T,
    status: ModLinkStatus
}

export const lifecycle = {
	typeCheck, init, jsStateInit, beforeGameloop, 
	compileMeta, compileMods, nativeStateInit
} as const

function typeCheck(mods: ModLinkInfo[]): ModLinkStatus {
	const response = new ModLinkStatus()
	for (let i = 0; i < mods.length; i++) {
		const mod = mods[i]
		// some kind of light type check on
		// mods, components, state, & archetypes
		const {wrapper, canonicalUrl} = mod
		const {ok, error} = validateMod(wrapper)
		if (ok) {
			continue
		}
		response.ok = false
		response.errors.push({
			msg: `mod ${canonicalUrl} is not typed correctly ${error}`,
			...ENGINE_CODES.mod_package_invalid_type
		})
	}
	return response
}

/**
 * mod lifecycle hook 1 => init hook.
 * runs all init hooks in parellel.
 * Can run in parellel because init hooks do not require any dependencies to run
 * @param mods 
 * @param metadata 
 * @param engine 
 */
async function init(
	mods: ModLinkInfo[], 
	metadata: ModMetadata[],
	engine: MainThreadEngineCore
): Promise<ModLinkStatus> {
	const response = new ModLinkStatus()
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
				...ENGINE_CODES.mod_init_hook_failed
			})
		}
	}))
	return response
}

/**
 * mod lifecycle hook 2 => js state hook
 * initializes all states in parellel.
 * Can run in parellel because init hooks do not require any dependencies to run
 * @param mods 
 * @param metadata 
 * @param engine 
 */
async function jsStateInit(
	mods: ModLinkInfo[],
	metadata: ModMetadata[],
	engine: MainThreadEngineCore
): Promise<ModLinkStatusWithPayload<object[]>> {
	const status = new ModLinkStatus()
	const states = mods.map(async (mod, index) => {
		const {data} = mod.wrapper
		const response = {ok: true, state: {}, msg: ""}
		if (!data.jsState) {
			return {}
		}
		const meta = metadata[index]
		try {
			return await data.jsState(meta, engine)
		} catch (err) {
			console.error("mod", meta.canonicalUrl, "threw exception during js state initialization", err)
			response.ok = false
			status.errors.push({
				msg: `mod ${meta.canonicalUrl} threw exception during js state initialization ${String(err)}`,
				...ENGINE_CODES.mod_js_state_init_failed
			})
			return {}
		}
	})
	return {data: states, status}
}

/**
 * mod lifecycle hook 3 => before game loop hook.
 * cannot run in parellel because mods may be dependant on 
 * other mods here.
 * TODO: determine mod order (based on dependencies).
 * @param mods 
 * @param engine 
 */
async function beforeGameloop(
	mods: ModLinkInfo[],
	engine: MainThreadEngine
): Promise<ModLinkStatus> {
	const response = new ModLinkStatus()
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
				...ENGINE_CODES.mod_before_event_loop_failed
			})
		}
	}
	return response
}

function compileMeta(mods: ModLinkInfo[]): ModMetadata[] {
	const metas = []
	let idCounter = 0
	for (let i = 0; i < mods.length; i++) {
		const {wrapper, resolvedUrl, canonicalUrl} = mods[i]
		const {data} = wrapper
		const meta: ModMetadata = {
			name: data.name,
			canonicalUrl,
			resolvedUrl,
			dependencies: data.dependencies || [],
			id: idCounter++
		}
		metas.push(meta)
	}
	return metas
}

const idMeta = {
	value: 0,
	enumerable: true,
	configurable: true,
	writable: false
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

function nativeStateInit(
	mods: ModLinkInfo[],
	metas: ModMetadata[],
	jsStates: object[]
): StateRefs {
	const state: StateRefs = {
		staticStates: [],
		archetypes: [],
		queries: [],
		componentIds: [],
		metadatas: metas,
		jsStates,
		componentCount: 0
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
	return state
}


function compileMods(
	mods: ModLinkInfo[], 
	stateRef: StateRefs
): CompiledMods {
	const modIndex = nullObject<CompiledMods>()
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
	return modIndex
}

// component object create
/*
		const componentsList: ComponentRegisterMeta[] = []
		for (let i = 0; i < mods.length; i++) {
			const mod = mods[i]
			const {wrapper} = mod
			const components = wrapper.data.components
			if (!components) {
				continue
			}
			const modName = wrapper.data.name
			const keys = Object.keys(components)
			for (let k = 0; k < keys.length; k++) {
				const key = keys[k]
				componentsList.push({
					name: `${modName}_${key}`,
					definition: components[key]
				})
			}
		}

		let componentContext: HydratedComponentObjectContext
		{
			const tokens = generateComponentObjectTokens(componentsList)
			// code should be cached somewhere to share with
			// worker threads
			const code = generateComponentObjectCode$(tokens)
			componentContext = hydrateComponentObjectContext(
				code.componentObjectContext, 
				engine.wasmHeap.jsHeap()
			)
		}
		*/
		