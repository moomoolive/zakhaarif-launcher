import {MainScriptArguments} from "zakhaarif-dev-tools"
import {Engine, ModLinkInfo} from "./lib/engine/core"

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
	
	console.info("attempting to import mods")
	const importPromises: Promise<ModLinkInfo | null>[] = []
	for (let i = 0; i < gameSave.mods.entryUrls.length; i++) {
		const resolved = gameSave.mods.resolvedUrls[i]
		const entry = gameSave.mods.entryUrls[i]
		const canonicalUrl = gameSave.mods.canonicalUrls[i]
		const semver = gameSave.mods.semvers[i]
		const url = resolved + entry
		importPromises.push((async () => {
			const modModule = await import(/* @vite-ignore */url)
			if (!("mod" in modModule)) {
				return null
			}
			return {
				wrapper: modModule.mod, 
				entryUrl: url,
				resolvedUrl: resolved,
				canonicalUrl,
				semver
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
    
	const rootCanvas = document.createElement("canvas")
	rootCanvas.id = "root-canvas"
	rootElement.appendChild(rootCanvas)
	
	const engine = await Engine.init({
		rootCanvas,
		threadedMode: false,
		threadId: Engine.MAIN_THREAD_ID
	})

	engine.css.addGlobalSheet(recommendedStyleSheetUrl, [["id", "daemon-recommend-style-sheet"]])

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

	const linkStatus = await engine.linkMods(imports)

	console.info("link status returned with", linkStatus)

	if (!linkStatus.ok) {
		console.error("failed to link mods, found", linkStatus.errors.length, "errors")
		for (const {msg, status, statusText} of linkStatus.errors) {
			console.error(`${status} (${statusText}) ${msg}`)
		}
		messageAppShell("signalFatalError", {
			details: "One of game mods is invalid (link error)"
		})
		return
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
		const milliseconds = 2_000
		setTimeout(() => messageAppShell("readyForDisplay"), milliseconds)
		window.requestAnimationFrame(runGameLoop)
	})
}
