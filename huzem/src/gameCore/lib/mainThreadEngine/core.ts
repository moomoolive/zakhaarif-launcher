import type {
	ConsoleCommandIndex,
	ConsoleCommandInputDeclaration,
	ModConsoleCommand,
	MainThreadEngine,
	LinkableMod,
	ComponentMetadata,
	ModMetadata,
	DependentsWithBrand,
	Struct,
} from "zakhaarif-dev-tools"
import {Mod} from "../mods/mod"
import {createCommand} from "./console"
import {Null, defineProp} from "../utils"
import {Archetype, ComponentBuffer} from "../mods/archetype"
import {stdlib, MetaManager} from "./standardLibrary"
import {SystemManager} from "./systems"
import {WasmCoreApis} from "../wasm/coreTypes"
import {WasmAllocatorConfig, WasmAllocator} from "../wasm/allocator"
import {
	NULL_PTR,
	NativeComponentContext, 
	nativeComponentFactory,
	orderKeys
} from "../compilers/nativeComponent"
import {Query} from "../mods/query"

export type ModLinkInfo = {
	wrapper: LinkableMod,
	resolvedUrl: string,
	canonicalUrl: string
    entryUrl: string
	semver: string
}

const BYTES_PER_32_BITS = 4

const ENTITY_META_COMP = { 
	id: 0,
	name: "entityMeta", 
	def: {entityId: "i32"},
	fieldTokens: [
		{
			byteSize: BYTES_PER_32_BITS,
			fieldName: "entityId",
			type: "i32",
			offset: 0
		}
	],
	sizeof: 1 * BYTES_PER_32_BITS,
	fieldCount: 1
} as const satisfies ComponentMetadata

export type EngineConfig = {
    rootCanvas?: HTMLCanvasElement | null
    rootElement?: HTMLElement | null
	threadedMode?: boolean

	coreBinary: WebAssembly.Module
	coreInstance: WebAssembly.Instance
	wasmMemory: WebAssembly.Memory
}

export class MainEngine extends Null implements MainThreadEngine {
	static readonly STATUS_CODES = {
		ok: 0,
		mod_before_event_loop_failed: 100,
		mod_js_state_init_failed: 101,
		mod_init_hook_failed: 102,
		mod_package_invalid_type: 103,
	} as const
	
	mods = new Null<{ readonly [key: string]: Mod }>()
	modState = {
		mods: <Mod[]>[],
		metadatas: <ModMetadata[]>[],
		jsStates: <object[]>[],
		componentMeta: <ComponentMetadata[]>[
			// standard components
			ENTITY_META_COMP
		],
		componentIds: <Record<string, number>[]>[],
		queries: <Query[]>[],
		queryCollections: <Record<string, Query>[]>[],
		archetypes: <Archetype[]>[],
		archetypeCollections: <Record<string, Archetype>[]>[],
	}
	isRunning = false
	gameLoopHandler = (_delta: number) => {}
	systems = new SystemManager()
	meta = new MetaManager(this.modState)
	devConsole = {
		index: new Null<ConsoleCommandIndex>(),
		engine: <MainEngine>this,
		addCommand<T extends ConsoleCommandInputDeclaration>(
			cmd: ModConsoleCommand<MainThreadEngine, T>
		) { createCommand(this.engine, this.index, cmd) }
	}
	wasm = {
		componentJsBindings: null as NativeComponentContext | null,
		coreInstance: null as WebAssembly.Instance | null,
		coreBinary: null as WebAssembly.Module | null
	}
	stdState = {
		originTime: 0.0,
		previousFrame: 0.0,
		elapsedTime: 0.0,
		// dom stuff will be null if running in Node (or server env)
		rootCanvas: null as HTMLCanvasElement | null,
		rootElement: null as HTMLElement | null
	}
	std = stdlib(this.stdState)

	wasmHeap: MainThreadEngine["wasmHeap"]
	
	constructor(config: EngineConfig) {
		super()
		const coreApis = config.coreInstance.exports as WasmCoreApis
		this.wasmHeap = new WasmAllocator(
			config.wasmMemory, coreApis as (
				WasmCoreApis & WasmAllocatorConfig
			)
		)
		this.stdState.rootCanvas = config.rootCanvas || null
		this.stdState.rootElement = config.rootElement || null
		this.wasm.coreBinary = config.coreBinary
		this.wasm.coreInstance = config.coreInstance
	}

	runFrameTasks(currentTime: number): number {
		this.stdState.elapsedTime = currentTime - this.stdState.previousFrame
		this.stdState.previousFrame = currentTime
		return this.systems.run(this)
	}

	ignite(currentTime: number): EngineCode {
		this.stdState.originTime = currentTime
		this.stdState.previousFrame = currentTime
		this.isRunning = true
		return MainEngine.STATUS_CODES.ok
	}

	async linkMods(inputMods: ModLinkInfo[]): Promise<ModLinkStatus> {
		const linkResponse: ModLinkStatus = {ok: true, errors: []}
		const modStateRef = this.modState

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
					status: MainEngine.STATUS_CODES.mod_package_invalid_type
				})
			}
		}
		if (!linkResponse.ok) {
			return linkResponse
		}

		{ 	// Compile metadata for mods
			const linkinfo = inputMods
			const modMetas = modStateRef.metadatas

			const metas = modMetas
			for (let i = 0; i < linkinfo.length; i++) {
				const {
					wrapper, resolvedUrl, canonicalUrl
				} = linkinfo[i]
				const {data} = wrapper
				const id = i
				metas.push({
					name: data.name,
					canonicalUrl,
					resolvedUrl,
					dependencies: (data.dependencies || []) as DependentsWithBrand<[]>,
					id
				})
			}
		}

		{ 	// Execute "init" lifecycle hook for all mods. 
			const response = linkResponse
			const mods = inputMods
			const metadata = modStateRef.metadatas
			const engine = this
			const stateRef = modStateRef

			await Promise.all(mods.map(async (mod, i) => {
				const {wrapper} = mod
				if (!wrapper.onInit) {
					return
				}
				const modId = stateRef.mods.length + i 
				const meta = metadata[modId]
				try {
					await wrapper.onInit(meta, engine)
				} catch (err) {
					console.error("mod", meta.canonicalUrl, "threw exception in init hook", err)
					response.errors.push({
						msg: `mod ${meta.canonicalUrl} threw exception in init hook ${String(err)}`,
						text: "mod_init_hook_failed",
						status: MainEngine.STATUS_CODES.mod_init_hook_failed
					})
				}
			}))
		}
		if (!linkResponse.ok) {
			return linkResponse
		}

		{	// Initialize mod state singletons for all mods.
			const status = linkResponse
			const metadata = modStateRef.metadatas
			const engine = this
			const mods = inputMods
			const stateRef = modStateRef
			const arr = stateRef.jsStates

			arr.push(await Promise.all(mods.map(async (m, i) => {
				const {data} = m.wrapper
				if (!data.state) {
					return {}
				}
				const modId = stateRef.mods.length + i
				const meta = metadata[modId]
				try {
					return await data.state(meta, engine)
				} catch (err) {
					const url = meta.canonicalUrl
					console.error("mod", url, "threw exception during js state initialization", err)
					status.ok = false
					status.errors.push({
						msg: `mod ${url} threw exception during js state initialization ${String(err)}`,
						text: "mod_js_state_init_failed",
						status: MainEngine.STATUS_CODES.mod_js_state_init_failed
					})
					return {}
				}
			})))
		}
		if (!linkResponse.ok) {
			return linkResponse
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
			const stateRef = modStateRef
			
			// initialize components
			const componentNameToIdMap = new Map<string, number>
			for (let i = 0; i < mods.length; i++) {
				const mod = mods[i]
				const modData = mod.wrapper.data
				
				const components = modData.components || {}
				const allComps = Object.keys(components)
				type CompName = string
				type CompId = number
				type CompRefs = Record<CompName, CompId>
				const componentRefs: CompRefs = {}
				stateRef.componentIds.push(componentRefs)
				for (let c = 0; c < allComps.length; c++) {
					const compName = allComps[c]
					const id = stateRef.componentMeta.length
					defineProp(componentRefs, compName, id)
					const def = components[compName]
					const name = `${modData.name}_${compName}`
					componentNameToIdMap.set(name, id)
					const fieldKeys = orderKeys(def)
					const fieldCount = fieldKeys.length
					type FieldToken = ComponentMetadata["fieldTokens"][number]
					const fieldTokens: FieldToken[] = []
					let sizeof = 0
					for (let f = 0; f < fieldCount; f++) {
						const fieldName = fieldKeys[f]
						const type = def[fieldName]
						const byteSize = BYTES_PER_32_BITS
						sizeof += byteSize
						const offset = f
						fieldTokens.push({
							byteSize, 
							type, 
							fieldName, 
							offset
						})
					}
					stateRef.componentMeta.push({
						id, 
						name, 
						def, 
						sizeof, 
						fieldCount, 
						fieldTokens
					})
				}
			}
			const componentContext = nativeComponentFactory(
				stateRef.componentMeta, 
				engine.wasmHeap.jsHeap()
			)
			engine.wasm.componentJsBindings = componentContext

			// initalize archetypes
			type ComponentId = number
			type ArchetypeId = number
			type CompArchMap = Map<ComponentId, Set<ArchetypeId>>
			const archComponentMap: CompArchMap = new Map()
			const entityMetaMap = new Set<ArchetypeId>()
			archComponentMap.set(ENTITY_META_COMP.id, entityMetaMap)
			for (let i = 0; i < mods.length; i++) {
				const modId = stateRef.mods.length + i
				const mod = mods[i]
				const modData = mod.wrapper.data
				const archetypes = mod.wrapper.archetypes || {}
				type ArchCollection = Record<string, Archetype>
				const collection = new Null<ArchCollection>()
				stateRef.archetypeCollections.push(collection)
				
				const archKeys = Object.keys(archetypes)
				for (let a = 0; a < archKeys.length; i++) {
					const key = archKeys[a]
					const archId = stateRef.archetypes.length
					const arch = new Archetype()
					stateRef.archetypes.push(arch)
					defineProp(collection, key, arch)

					arch.id = archId
					arch.modId = modId
					arch.name = `${modData.name}_${key}`
					const archDef = archetypes[key]
					const archComps = archDef.meta()
					
					let sizeof = 0 + ENTITY_META_COMP.sizeof
					arch.componentIds.push(ENTITY_META_COMP.id)
					entityMetaMap.add(archId)
					for (let c = 0; c < archComps.length; i++) {
						const compKey = archComps[c].key
						const compId = componentNameToIdMap.get(compKey) || -1
						const compExists = compId >= 0
						if (!compExists) {
							// should warn here?
							continue
						}
						arch.componentIds.push(compId)
						const compRecord = archComponentMap.get(compId)
						if (!compRecord) {
							const record = new Set<ArchetypeId>()
							record.add(archId)
							archComponentMap.set(compId, record)
						} else {
							compRecord.add(archId)
						}
						sizeof += stateRef.componentMeta[compId].sizeof
					}
					arch.entityBytes = sizeof
					arch.componentIds.sort()

					const allocator = engine.wasmHeap
					for (let c = 0; c < arch.componentIds.length; c++) {
						const compId = arch.componentIds[c]
						const meta = stateRef.componentMeta[compId]
						const ptrBufferSize = (
							meta.fieldCount * BYTES_PER_32_BITS
						)
						const bufferPtr = allocator.unsafeMalloc(
							ptrBufferSize,
							4
						)
						const fieldPtrBuffer = new Uint32Array(
							allocator.rawMemory().buffer, 
							bufferPtr, 
							meta.fieldCount
						)
						type BufferMeta = ComponentBuffer["meta"][number]
						const metabuffer: BufferMeta[] = []
						for (let f = 0; f < meta.fieldTokens.length; f++) {
							const token = meta.fieldTokens[f]
							metabuffer.push({
								elementSize: token.byteSize
							})
							fieldPtrBuffer[f] = NULL_PTR
						}
						arch.componentBuffers.push({
							bufferPtrs: fieldPtrBuffer,
							meta: metabuffer
						})
					}

					const templateCount = 1
					arch.templatesPtr = allocator.unsafeCalloc(
						arch.sizeOfEntity() * templateCount,
						BYTES_PER_32_BITS
					)
					const floatView = new componentContext.PointerViewF32()
					const intView = new componentContext.PointerViewI32()
					// same process for the rest of templates
					for (let c = 0; c < archComps.length; c++) {
						const comp = archComps[c]
						const compKey = comp.key
						const compId = componentNameToIdMap.get(compKey) || -1
						const compExists = compId >= 0
						if (!compExists) {
							// should warn here?
							continue
						}
						
						const compOffset = arch.getComponentOffset(compId)
						const meta = stateRef.componentMeta[compId]
						const isFloat = meta.fieldTokens[0].type === "f32"
						const objectDef = comp.initialValue
						if (isFloat) {
							const v = floatView.toLayout$(compId)
							v.p$ = (arch.templatesPtr / BYTES_PER_32_BITS) + compOffset
							for (const [nativeField, value] of Object.entries(objectDef)) {
								v[nativeField as `_${string}`] = value
							}
						} else {
							const v = intView.toLayout$(compId)
							v.p$ = (arch.templatesPtr / BYTES_PER_32_BITS) + compOffset
							for (const [nativeField, value] of Object.entries(objectDef)) {
								v[nativeField as `_${string}`] = value
							}
						}
					}
				}
			}

			// initialize queries
			for (let i = 0; i < mods.length; i++) {
				const mod = mods[i]
				const modId = stateRef.mods.length + i
				const queryRecord = mod.wrapper.queries || {}
				
				const collection = new Null<Record<string, Query>>()
				stateRef.queryCollections.push(collection)
				const queryKeys = Object.keys(queryRecord)
				for (let q = 0; q < queryKeys.length; q++) {
					const queryName = queryKeys[q]
					const id = stateRef.queries.length
					const query = new Query()
					stateRef.queries.push(query)
					defineProp(collection, queryName, query)

					query.id = id
					query.name = `${mod.wrapper.data.name}_${queryName}`
					query.modId = modId
					
					const terms = queryRecord[queryName].meta()
					for (let t = 0; t < terms.length; t++) {
						const term = terms[t]
						const compKey = term.key
						const compId = componentNameToIdMap.get(compKey) || -1
						const compExists = compId >= 0
						if (!compExists) {
							// should warn here?
							continue
						}
						if (term.without) {
							query.withoutComps.push(compId)
							continue
						}

						const meta = stateRef.componentMeta[compId]
						const isFloat = meta.fieldTokens[0].type === "f32"
						if (isFloat) {
							const v = new componentContext.PointerViewSoaF32().toLayout$(compId)
							query.value.push(v as unknown as Struct)
						} else {
							const v = new componentContext.PointerViewSoaI32().toLayout$(compId)
							query.value.push(v as unknown as Struct)
						}

						if (term.optional) {
							query.optionalComps.push(compId)
						} else {
							query.requiredComps.push(compId)
						}
						query.iteratorComponents.push(compId)
					}

					const compMap = archComponentMap
					const initialArchsSet = compMap.get(query.requiredComps[0])
					if (!initialArchsSet) {
						// iterators should have at least one required
						// component for query
						// warn here?
						continue
					}
					const initialArchs = [...initialArchsSet]
					query.archetypes = initialArchs
					for (let t = 1; t < query.requiredComps.length; t++) {
						const requiredCompId = query.requiredComps[t]
						const compSet = compMap.get(requiredCompId)
						if (!compSet) {
							// warn here ?
							continue
						}

						const removeIndexes: number[] = []
						for (let a = 0; a < initialArchs.length; a++) {
							const archId = initialArchs[a]
							const archHasComp = compSet.has(archId)
							if (!archHasComp) {
								removeIndexes.push(a)
							}
						}

						for (let a = 0; a < removeIndexes.length; a++) {
							initialArchs.splice(removeIndexes[a], 1)
						}
					}

					for (let t = 0; t < query.withoutComps.length; t++) {
						const withoutCompId = query.requiredComps[t]
						const compSet = compMap.get(withoutCompId)
						if (!compSet) {
							// warn here ?
							continue
						}

						const removeIndexes: number[] = []
						for (let a = 0; a < initialArchs.length; a++) {
							const archId = initialArchs[a]
							const archHasComp = compSet.has(archId)
							if (archHasComp) {
								removeIndexes.push(a)
							}
						}

						for (let a = 0; a < removeIndexes.length; a++) {
							initialArchs.splice(removeIndexes[a], 1)
						}
					}
				}
			}

			// initialize mod wrapper
			const modIndex = new Null<MainEngine["mods"]>()
			engine.mods = modIndex
			const originalModLen = stateRef.mods.length
			for (let i = 0; i < mods.length; i++) {
				const modId = originalModLen + i
				const mod = mods[i]
				const modData = mod.wrapper.data
				const compiled = new Mod({
					id: modId,
					name: modData.name,
					version: mod.semver,
					state: stateRef.jsStates[modId],
					meta: stateRef.metadatas[modId],
					queries: stateRef.queryCollections[modId],
					archetypes: stateRef.archetypeCollections[modId],
					componentIds: stateRef.componentIds[modId]
				})
				stateRef.mods.push(compiled)
				defineProp(modIndex, modData.name, compiled)
			}
		}

		{ 	// Execute "beforeGameLoop" lifecycle event.
			const mods = inputMods
			const engine = this
			const response = linkResponse

			await Promise.all(mods.map(async (mod) => {
				if (!mod.wrapper.onBeforeGameLoop) {
					return
				}
				try {
					await mod.wrapper.onBeforeGameLoop(engine)
				} catch (err) {
					console.error("mod", mod.canonicalUrl, "threw exception during before game loop event", err)
					response.errors.push({
						msg: `mod ${mod.canonicalUrl} threw exception during before game loop event ${String(err)}`,
						text: "mod_before_event_loop_failed",
						status: MainEngine.STATUS_CODES.mod_before_event_loop_failed
					})
				}
			}))
		}

		return linkResponse
	}
}

type EngineCode = typeof MainEngine.STATUS_CODES[keyof typeof MainEngine.STATUS_CODES]
type EngineStatusText = keyof typeof MainEngine.STATUS_CODES

type ModLinkStatus = {
	errors: {
		msg: string 
		text: EngineStatusText 
		status: EngineCode
	}[]
	ok: boolean
}
