import {main as start} from "./index"
import {isIframe} from "@/lib/utils/isIframe"

if (!isIframe()) {
    throw new Error("game component must run in an iframe")
}

console.log("😭 game loaded...")
const gameCanvas = document.createElement("canvas")
gameCanvas.setAttribute("id", "game-frame-canvas")
let inited = false

const main = () => {
    if (inited) {
        return
    }
    const root = document.getElementById("game-root")!
    if (!document.getElementById("game-frame-canvas")) {
        root.append(gameCanvas)
    }
    //start(gameCanvas)
    inited = true
}