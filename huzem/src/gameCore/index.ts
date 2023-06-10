import {MainScriptArguments} from "zakhaarif-dev-tools"
import {MainEngine, ModLinkInfo} from "./lib/mainThreadEngine/core"
import {createWasmMemory, ffiCore} from "./lib/wasm/coreTypes"
import {wasmMap} from "../wasmBinaryPaths.mjs"
import {defineProp} from "./lib/utils"

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
			details: "game save doesn't exist",
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
    
	const rootCanvas = document.createElement("canvas")
	rootCanvas.id = "root-canvas"
	rootElement.appendChild(rootCanvas)
	
	const wasmMemory = createWasmMemory()
	const binaryUrl = new URL(
		wasmMap.engine_wasm_core, import.meta.url
	).href
	const ffi = ffiCore({wasmMemory})
	const core = await WebAssembly.instantiateStreaming(
		fetch(binaryUrl), ffi
	)
	const engine = new MainEngine({
		rootCanvas,
		threadedMode: false,
		rootElement,
		wasmMemory,
		coreBinary: core.module,
		coreInstance: core.instance,
	})

	console.info("engine created")
	// These engine properties are added to the 
	// global object so that they
	// can be easily accessed from browser console (or repl)
	defineProp(globalThis, "zengine", engine)
	defineProp(globalThis, "zconsole", engine.devConsole.index)

	engine.std.css.addGlobalSheet(recommendedStyleSheetUrl, {
		id: "daemon-recommend-style-sheet"
	})

	console.info("attempting to import mods")
	const importPromises: Promise<ModLinkInfo | null>[] = []
	for (let i = 0; i < gameSave.mods.entryUrls.length; i++) {
		const resolved = gameSave.mods.resolvedUrls[i]
		const entry = gameSave.mods.entryUrls[i]
		const canonicalUrl = gameSave.mods.canonicalUrls[i]
		const semver = gameSave.mods.semvers[i]
		const url = resolved + entry
		importPromises.push((async () => {
			try {
				const modModule = await import(/* @vite-ignore */url)
				if (!("mod" in modModule)) {
					console.error("could not find 'mod' in imported module")
					return null
				}
				return {
					wrapper: modModule.mod, 
					entryUrl: url,
					resolvedUrl: resolved,
					canonicalUrl,
					semver
				}
			} catch (err) { 
				console.error("error when importing module", err)
				return null 
			}
		})())
	}

	const importAttempts = await Promise.all(importPromises)

	const imports = []
	for (const importAttempt of importAttempts) {
		if (!importAttempt) {
			console.warn("module import failed")
			return
		}
		imports.push(importAttempt)
	}
	
	console.info(`Found ${imports.length} imports`)

	const linkStatus = await engine.linkMods(imports)

	console.info("link status returned with", linkStatus)

	if (!linkStatus.ok) {
		console.error("failed to link mods, found", linkStatus.errors.length, "errors")
		for (const {msg, status, text} of linkStatus.errors) {
			console.error(`(${text}) ${msg} [code = ${status}]`)
		}
		messageAppShell("signalFatalError", {
			details: "One of game mods is invalid (link error)"
		})
		return
	}

	engine.gameLoopHandler = (delta: number) => {
		const response = engine.runFrameTasks(delta)
		if (!engine.isRunning) {
			console.warn("engine has stopped running, tasks returned with status", response)
			return
		}
		window.requestAnimationFrame(engine.gameLoopHandler)
	}

	window.requestAnimationFrame((time) => {
		const response = engine.ignite(time)
		if (response !== MainEngine.STATUS_CODES.ok) {
			console.error("engine failed to start, returned with status", response)
			return
		}
		const milliseconds = 1_000
		setTimeout(
			() => messageAppShell("readyForDisplay"), 
			milliseconds
		)
		console.info("starting game loop...")
		window.requestAnimationFrame(engine.gameLoopHandler)
	})
}
