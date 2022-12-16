import {main} from "./index"
import {useEffect} from "react"

let inited = false

const GameRoot = ({id}: {id: string}) => {
    
    useEffect(() => {
        if (inited) {
            return
        }
        const root = document.getElementById("game-root")
        console.log(root)
        inited = true
        main(root!)
    }, [])

    return <>
        <div className="z-50" id={id}/>
    </>
}

export default GameRoot