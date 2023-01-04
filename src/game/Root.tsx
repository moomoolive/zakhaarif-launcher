import {main} from "./index"
import {useEffect} from "react"
import {isIframe} from "@/lib/checks/index"

if (!isIframe()) {
    throw new Error("game component must run in an iframe")
}

console.log("😭 game loaded...")
const gameCanvas = document.createElement("canvas")
gameCanvas.setAttribute("id", "game-frame-canvas")

let inited = false

export const GameRoot = ({id}: {id: string}) => {
    
    useEffect(() => {
        if (inited) {
            return
        }
        const root = document.getElementById("game-root")!
        if (!document.getElementById("game-frame-canvas")) {
            root.append(gameCanvas)
        }
        //main(gameCanvas)
        inited = true
    }, [])

    return <>
        <div id={id}>

        </div>
    </>
}