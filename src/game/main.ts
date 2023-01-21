//import {main as start} from "./index"
import type {MainScriptArguments} from "../lib/types/extensions"
import rawCssExtension from "../index.css?url"

export const main = async (args: MainScriptArguments) => {
    console.info("[GAME LOADED] 😭 game loaded... with args =", args)
    const {messageAppShell, initialState, rootElement} = args
    const {rootUrl} = initialState
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
    const res = await messageAppShell("readyForDisplay")
    console.info("controller res", res)
}