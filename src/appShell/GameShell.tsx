import {useNavigate} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear} from "@fortawesome/free-solid-svg-icons"
import {Button} from "@mui/material"
import startGameUrl from "@/game/main?url"
import {wRpc} from "../lib/wRpc/simple"
import {sandboxToControllerRpc} from "../lib/utils/workerCommunication/controllerFrame"

const sanboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
const programFrameId = "program-frame"

const GameShellPage = () => {
    const navigate = useNavigate()

    const [error, setError] = useState(false)
    const iframeRpc = useRef<
        null | wRpc<typeof sandboxToControllerRpc>
    >(null)
    const programListener = useRef<(_: MessageEvent) => any>(() => {})

    useEffect(() => {
        const programContainer = document.getElementById("program-frame-container")
        if (!programContainer) {
            console.error("couldn't find program container")
            return
        }
        const programElement = document.getElementById(programFrameId)
        if (programElement) {
            return
        }
        const gameEntry = `${location.origin}${startGameUrl}`
        const programFrame = document.createElement("iframe")
        programFrame.allow = ""
        programFrame.name = "game-frame"
        programFrame.id = programFrameId
        programFrame.setAttribute("sandbox", "allow-scripts allow-same-origin")
        programFrame.width = "100%"
        programFrame.height = "100%"
        iframeRpc.current = new wRpc({
            responses: sandboxToControllerRpc,
            messageTarget: {
                postMessage: (data, transferables) => {
                    programFrame.contentWindow?.postMessage(
                        data, "*", transferables
                    )
                }
            },
            messageInterceptor: {
                addEventListener: (_, handler) => {
                    const listener = (event: MessageEvent) => {
                        handler({data: event.data})
                    }
                    programListener.current = listener
                    window.addEventListener("message", listener)
                }
            }
        })
        programFrame.src = `${sanboxOrigin}/runProgram?entry=${encodeURIComponent(gameEntry)}&csp=${encodeURIComponent(`default-src 'self' ${location.origin};`)}`
        programContainer.appendChild(programFrame)
        return /*() => {
            if (import.meta.env.PROD) {
                window.removeEventListener("message", programListener.current)
            }
        }*/
    }, [])

    return <div>
        {error ? <>
            <div className="relative text-center z-10 w-screen h-screen flex justify-center items-center">
                <div className="w-full">
                    <div className="mb-5 text-6xl text-yellow-500">
                        <FontAwesomeIcon icon={faSadTear}/>
                    </div>

                    <div className="mb-3">
                        <div className="text-xl text-neutral-100 mb-2">
                            {"An error occurred..."}
                        </div>
                        <div className="text-xs text-neutral-500">
                            Check dev tools for more info
                        </div>
                    </div>
                    
                    <div>
                        <Button
                            onClick={() => navigate("/start")}
                            size="large"
                        >
                            To Start Menu
                        </Button>
                    </div>
                </div>
            </div>
        </> : <></>}

        <div 
            id="program-frame-container"
            className="z-0 fixed left-0 top-0 w-screen h-screen overflow-clip"
        >
        </div>
    </div>
}

export default GameShellPage