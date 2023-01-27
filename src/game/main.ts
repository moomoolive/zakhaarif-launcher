//import {main as start} from "./index"
import type {MainScriptArguments} from "../lib/types/extensions"

export const main = async (args: MainScriptArguments) => {
    console.info("[GAME LOADED] 😭 game loaded... with args =", args)
    const {messageAppShell, initialState} = args
    const {queryState, authToken, recommendedStyleSheetUrl} = initialState
    const cssSheet = document.createElement("link")
    cssSheet.rel = "stylesheet"
    cssSheet.crossOrigin = ""
    cssSheet.href = recommendedStyleSheetUrl
    cssSheet.id = "main-style-sheet"
    document.head.appendChild(cssSheet)
    const gameId = parseInt(queryState, 10)
    if (isNaN(gameId)) {
        console.error("inputted game id is not a number. game_id =", queryState)
        messageAppShell("signalFatalError", authToken)
        return
    }
    const gameSave = await messageAppShell("getSaveFile", gameId)
    if (!gameSave) {
        console.error("inputted game id doesn't exist", gameId)
        messageAppShell("signalFatalError", authToken)
        return
    }
    console.log("game save found", gameSave)
    const res = await messageAppShell("readyForDisplay")
    //messageAppShell("signalFatalError", authToken)
    console.info("controller res", res)
}