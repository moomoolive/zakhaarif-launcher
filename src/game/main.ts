//import {main as start} from "./index"
import type {MainScriptArguments} from "../lib/types/extensions"

export const main = (args: MainScriptArguments) => {
    console.log("[GAME LOADED] 😭 game loaded... with args =", args)
    const {messageAppShell} = args
    window.setTimeout(async () => {
        const res = await messageAppShell("readyForDisplay")
        console.log("frame is ready for display, res =", res)
    }, 3_000)
}