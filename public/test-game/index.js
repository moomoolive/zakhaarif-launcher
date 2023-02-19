/**
 * @param {import("../../src/lib/types/extensions").MainScriptArguments} args 
 * @returns 
 */
export const main = async (args) => {
    console.info("[GAME LOADED] 😭 game loaded... with args =", args)
    const {messageAppShell, initialState} = args
    const {queryState, authToken, recommendedStyleSheetUrl} = initialState
    const inputId = queryState.length < 1 ? "-1" : queryState
    const gameId = parseInt(inputId, 10)
    if (isNaN(gameId)) {
        console.error("inputted game id is not a number. game_id =", queryState)
        messageAppShell("signalFatalError", {
            extensionToken: authToken,
            details: "invalid game save ID"
        })
        return
    }
    const gameSave = await messageAppShell("getSaveFile", gameId)
    if (!gameSave) {
        console.error("inputted game id doesn't exist", gameId)
        messageAppShell("signalFatalError", {
            extensionToken: authToken,
            details: "game save doesn't exist"
        })
        return
    }
    console.log("game save found", gameSave)
    if (!initialState.configuredPermissions) {
        const {canonicalUrls} = gameSave.mods
        console.log("Configuring permissions. cargos", canonicalUrls)
        await messageAppShell("reconfigurePermissions", {
            canonicalUrls,
            authToken
        })
        return
    }
    console.log("Permissions configured! starting game!")
    const cssSheet = document.createElement("link")
    cssSheet.rel = "stylesheet"
    cssSheet.crossOrigin = ""
    cssSheet.href = recommendedStyleSheetUrl
    cssSheet.id = "main-style-sheet"
    document.head.appendChild(cssSheet)
    console.log("attempting to import mods")
    /** @type {string[]} */
    const importUrls = []
    console.log(gameSave.mods)
    for (let i = 0; i < gameSave.mods.entryUrls.length; i++) {
        const resolved = gameSave.mods.resolvedUrls[i]
        const entry = gameSave.mods.entryUrls[i]
        importUrls.push(resolved + entry)
    }
    await Promise.all(importUrls.map((url) => import(url)))
    console.info("creating worker")
    const file = await fetch(new URL("./worker.js", import.meta.url))
    const blobUrl = URL.createObjectURL(await file.blob())
    const worker = new Worker(blobUrl, {
        type: "module",
        name: "test-worker"
    })
    worker.postMessage("hello there")
    const res = await messageAppShell("readyForDisplay")
    console.info("controller res", res)
}