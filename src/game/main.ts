//import {main as start} from "./index"
import type {MainScriptArguments} from "../lib/types/extensions"
import rawCssExtension from "../index.css?url"

export const main = async (args: MainScriptArguments) => {
    console.info("[GAME LOADED] 😭 game loaded... with args =", args)
    const {messageAppShell, initialState, rootElement} = args
    const {rootUrl, queryState, authToken} = initialState
    const cssExtension = rawCssExtension.startsWith("/")
        ? rawCssExtension.slice(1)
        : rawCssExtension
    const cssUrl = rootUrl + cssExtension
    
    const cssSheet = document.createElement("link")
    cssSheet.rel = "stylesheet"
    cssSheet.crossOrigin = ""
    cssSheet.href = cssUrl
    cssSheet.id = "main-style-sheet"
    document.head.appendChild(cssSheet)
    rootElement.className = "bg-neutral-800 leading-snug relative z-0"
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
    console.info("controller res", res)
}