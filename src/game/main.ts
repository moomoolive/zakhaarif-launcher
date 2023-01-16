//import {main as start} from "./index"
import {isIframe} from "@/lib/utils/isIframe"
import type {MainScriptArguments} from "@/lib/types/programs"

if (!isIframe()) {
    throw new Error("game component must run in an iframe")
}

let inited = false

export const main = (args: MainScriptArguments) => {
    console.log("[GAME LOADED] 😭 game loaded... with args =", args)
    if (inited) {
        return
    }
    inited = true
}