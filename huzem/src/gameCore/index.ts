import type {
	MainScriptArguments,
	ModModule, 
	ShaheenEngine
} from "zakhaarif-dev-tools"
import {ModWrapper} from "./modWrapper"

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
		importedModule: ModModule, 
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

	const systems: ((e: typeof engine) => void)[] = []

	const engine: ShaheenEngine<[]> = {
		allocator: {
			getRawMemory: () => new WebAssembly.Memory({
				initial: 1,
			}),
			malloc: () => 0,
			realloc: () => 0,
			free: () => 0
		},
		mods: {},
		getRootCanvas: () => rootCanvas,
		getDeltaTime: () => 0.0,
		ecs: {
			addSystem: (system) => {
				systems.push(system)
				return 1
			},
			step: () => {
				for (const system of systems) {
					system(engine)
				}
				return 0
			}
		}
	}

	for (const metadata of imports) {
		const {importedModule, url} = metadata
		if (!("default" in importedModule)) {
			console.error(`import ${url} does not contain a default export. ignoring...`)
			continue
		}

		const mod = importedModule.default
		if (mod.onInit) {
			await mod.onInit(metadata, engine)
		}
		
		const modWrapper = new ModWrapper({
			alias: mod.alias,
			canonicalUrl: metadata.canonicalUrl,
			resolvedUrl: metadata.resolvedUrl,
			dependencies: mod.dependencies || [],
			originalModule: importedModule,
			resources: mod.resources || {},
			state: mod.state 
				? await mod.state(metadata, engine)
				: {}
		})

		Object.defineProperty(engine.mods, mod.alias, {
			configurable: true,
			enumerable: true,
			writable: true,
			value: modWrapper
		})

		if (mod.onBeforeGameLoop) {
			await mod.onBeforeGameLoop(engine)
		}
		
	}

	const stepResponse = engine.ecs.step()
	console.info("ecs step returned", stepResponse)

	messageAppShell("readyForDisplay")
}