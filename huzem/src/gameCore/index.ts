import {
	ComponentClass,
	MainScriptArguments,
	ModMetadata,
	ModEsModule
} from "zakhaarif-dev-tools"
import {
	Engine,
	MAIN_THREAD_ID,
} from "./engine"
import {CompiledMod} from "./lib/mods/compiledMod"
import initHeap from "./engine_allocator/pkg/engine_allocator"
import {wasmMap} from "../wasmBinaryPaths.mjs"
import {WasmHeap} from "./lib/heap/wasmHeap"
import {
	compileComponentClass
} from "./lib/mods/componentView"

const HEAP_RELATIVE_URL = wasmMap.engine_allocator

export const main = async (args: MainScriptArguments) => {
	console.info("[🌟 GAME LOADED] script args =", args)
	const {messageAppShell, initialState, rootElement} = args
	const {queryState, recommendedStyleSheetUrl} = initialState
	const inputId = queryState.length < 1 ? "-1" : queryState
	const gameId = parseInt(inputId, 10)
	if (isNaN(gameId)) {
		console.error("inputted game id is not a number. game_id =", queryState)
		messageAppShell("signalFatalError", {details: "invalid game save ID"})
		return
	}
	const gameSave = await messageAppShell("getSaveFile", gameId)
	if (!gameSave) {
		console.error("inputted game id doesn't exist", gameId)
		messageAppShell("signalFatalError", {
			details: "game save doesn't exist"
		})
		return
	}
	console.info("game save found", gameSave)
	if (!initialState.configuredPermissions) {
		const {canonicalUrls} = gameSave.mods
		console.info("Configuring permissions. cargos", canonicalUrls)
		await messageAppShell("reconfigurePermissions", {canonicalUrls})
		return
	}
	console.info("Permissions configured! starting game!")
	const cssSheet = document.createElement("link")
	cssSheet.rel = "stylesheet"
	cssSheet.crossOrigin = ""
	cssSheet.href = recommendedStyleSheetUrl
	cssSheet.id = "main-style-sheet"
	document.head.appendChild(cssSheet)
	console.info("attempting to import mods")
	const importUrls: string[] = []
	console.info(gameSave.mods)
	for (let i = 0; i < gameSave.mods.entryUrls.length; i++) {
		const resolved = gameSave.mods.resolvedUrls[i]
		const entry = gameSave.mods.entryUrls[i]
		importUrls.push(resolved + entry)
	}
	type ImportType = {
		importedModule: ModEsModule, 
		url: string,
		canonicalUrl: string,
		resolvedUrl: string
	}
	const importPromises: Promise<ImportType>[] = []
	for (let i = 0; i < gameSave.mods.entryUrls.length; i++) {
		const resolved = gameSave.mods.resolvedUrls[i]
		const entry = gameSave.mods.entryUrls[i]
		const canonicalUrl = gameSave.mods.canonicalUrls[i]
		const url = resolved + entry
		importPromises.push((async () => {
			return {
				importedModule: await import(/* @vite-ignore */url), 
				url,
				resolvedUrl: resolved,
				canonicalUrl
			}
		})())
	}

	const imports = await Promise.all(importPromises)
	
	console.info(`Found ${imports.length} imports`)
    
	const rootCanvas = document.createElement("canvas")
	rootCanvas.id = "root-canvas"
	rootElement.appendChild(rootCanvas)

	const heapUrl = new URL(
		HEAP_RELATIVE_URL, import.meta.url
	).href
	console.info("Loading heap...", heapUrl)

	const engine = new Engine({
		rootCanvas,
		wasmHeap: new WasmHeap(await initHeap(heapUrl)),
		threadId: MAIN_THREAD_ID
	})

	Object.defineProperty(globalThis, "zengine", {
		value: engine,
		enumerable: true,
		writable: false,
		configurable: true
	})

	Object.defineProperty(globalThis, "zconsole", {
		value: engine.console,
		enumerable: true,
		writable: false,
		configurable: true
	})

	for (const importMetadata of imports) {
		const {importedModule, url} = importMetadata
		if (!("mod" in importedModule)) {
			console.error(`import ${url} does not contain a default export. ignoring...`)
			continue
		}

		const mod = importedModule.mod
		
		const modMetadata: ModMetadata = {
			name: mod.data.name,
			canonicalUrl: importMetadata.canonicalUrl,
			resolvedUrl: importMetadata.resolvedUrl,
			dependencies: mod.data.dependencies || [],
		}
		
		if (mod.onInit) {
			await mod.onInit(modMetadata, engine)
		}

		let modState = {}
		if (mod.data.state) {
			modState = await mod.data.state(modMetadata, engine)
		}

		const queries = mod.data.queries || {}
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

		const componentClasses: Record<string, ComponentClass> = Object.create(null)
		const components = mod.data.components || {}
		const componentNames = Object.keys(components)
		for (let i = 0; i < componentNames.length; i++) {
			const componentName = componentNames[i]
			const definition = components[componentName]
			const fullname = `${mod.data.name}.${componentName}`
			const compilerResponse = compileComponentClass(
				componentName,
				definition,
				fullname,
				i
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
		}

		const modArchetypes = mod.data.archetypes || {}
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

		const compiledMod = new CompiledMod({
			state: modState,
			meta: modMetadata,
			resources: (mod.data.resources || {}) as Record<string, string>,
			queries: queryAccessors,
			componentClasses,
			archetypes
		})
		
		Object.defineProperty(engine.compiledMods, mod.data.name, {
			configurable: true,
			enumerable: true,
			writable: false,
			value: compiledMod
		})

		if (mod.onBeforeGameLoop) {
			await mod.onBeforeGameLoop(engine)
		}
		
	}

	const runGameLoop = (time: number) => {
		engine.elapsedTime = time - engine.previousFrame
		engine.previousFrame = time
		engine.ecs.step()
		if (!engine.isRunning) {
			return
		}
		window.requestAnimationFrame(runGameLoop)
	}

	window.requestAnimationFrame((time) => {
		engine.originTime = time
		engine.previousFrame = time
		engine.isRunning = true
		console.info("starting game loop...")
		window.requestAnimationFrame(runGameLoop)
	})

	messageAppShell("readyForDisplay")
}