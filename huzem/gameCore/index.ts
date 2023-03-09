import type {MainScriptArguments} from "../../src/lib/types/extensions"
import type {ZakhaarifModEsModule} from "../../common/zakhaarif-dev-tools"

export const main = async (args: MainScriptArguments) => {
    console.info("[GAME LOADED] 😭 game loaded... with args =", args)
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
    console.log("game save found", gameSave)
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
    console.log(gameSave.mods)
    for (let i = 0; i < gameSave.mods.entryUrls.length; i++) {
        const resolved = gameSave.mods.resolvedUrls[i]
        const entry = gameSave.mods.entryUrls[i]
        importUrls.push(resolved + entry)
    }
    const imports: {mod: ZakhaarifModEsModule, url: string}[] = await Promise.all(
        importUrls.map(async (url) => ({mod: await import(url), url}))
    )
    console.info(`Found ${imports.length} imports`)
    
    const rootCanvas = document.createElement("canvas")
    rootCanvas.id = "root-canvas"
    rootElement.appendChild(rootCanvas)

    for (const {mod, url} of imports) {
        if (!("default" in mod)) {
            console.error(`import ${url} does not export a member called 'pkg'. ignoring...`)
            continue
        }
        mod.default.init(rootCanvas)
    }
}