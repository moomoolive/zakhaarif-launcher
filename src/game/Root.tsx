import {main} from "./index"
import {useEffect} from "react"

const gameCanvas = document.createElement("canvas")
gameCanvas.setAttribute("id", "game-frame-canvas")

/*
{(() => {
    try {
        console.log("idb type", typeof window.indexedDB)
        const db = window.indexedDB
    } catch {
        console.log("failed idb call")
    }
})()}
*/

let inited = false

const GameRoot = ({id}: {id: string}) => {
    
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

export default GameRoot