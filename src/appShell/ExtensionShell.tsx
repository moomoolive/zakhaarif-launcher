import {useSearchParams, Link} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear} from "@fortawesome/free-solid-svg-icons"
import {Button, Tooltip} from "@mui/material"
import startGameUrl from "@/game/main?url"
import {wRpc} from "../lib/wRpc/simple"
import {sandboxToControllerRpc} from "../lib/utils/workerCommunication/controllerFrame"
import {FullScreenLoadingOverlay} from "../components/LoadingOverlay"
import {GAME_EXTENSION_ID, MOD_CARGO_ID_PREFIX} from "../config"
import {useAppShellContext} from "./store"
import {CargoIndex} from "../lib/shabah/wrapper"

const sanboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
const programFrameId = "program-frame"
const NO_EXTENSION_ID = ""

const ExtensionShellPage = () => {
    const {downloadClient} = useAppShellContext()
    const [searchParams] = useSearchParams()

    const [error, setError] = useState(false)
    const [errorMessage, setErrorMessage] = useState("An error occurred...")
    const [loading, setLoading] = useState(true)
    type ControllerRpc = wRpc<typeof sandboxToControllerRpc>
    const iframeRpc = useRef<null | ControllerRpc>(null)
    const [extensionEntry, setExtensionEntry] = useState("")

    const extensionListener = useRef<(_: MessageEvent) => any>(() => {})
    const extensionInitialState = useRef("")

    useEffectAsync(async () => {
        const id = searchParams.get("id") || NO_EXTENSION_ID
        extensionInitialState.current = searchParams.get("state") || ""

        const extensionId = decodeURIComponent(id)
        if (extensionId.startsWith(MOD_CARGO_ID_PREFIX)) {
            setLoading(false)
            setError(true)
            setErrorMessage("Invalid Extension")
            console.warn(`Prevented mod "${extensionId}" from running. Mods cannot be run as standalone extensions and only run when embedded in the game extension (id="${GAME_EXTENSION_ID}")`)
            return
        }

        if (extensionId === GAME_EXTENSION_ID) {
            setLoading(false)
            setExtensionEntry(`${location.origin}${startGameUrl}`)
            return
        }

        let meta: CargoIndex | null
        if (
            extensionId.length > 0 
            && (meta = await downloadClient.getCargoMeta(extensionId))
        ) {
            setExtensionEntry(meta.entry)
            setLoading(false)
            return
        }
        if (extensionId.length > 0) {
            console.warn(`extension "${extensionId}" doesn't exist.`)
        } else {
            console.warn(`a query parameter "id" must be included in url to run an extension.`)
        }
        setLoading(false)
        setError(true)
        setErrorMessage("Extension Not Found")
    }, [])

    useEffect(() => {
        if (extensionEntry.length < 1) {
            return
        }
        const programContainer = document.getElementById("program-frame-container")
        if (!programContainer) {
            console.error("couldn't find program container")
            return
        }
        const programElement = document.getElementById(programFrameId)
        if (programElement) {
            return
        }
        const entry = extensionEntry
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
                    extensionListener.current = listener
                    window.addEventListener("message", listener)
                }
            }
        })
        programFrame.src = `${sanboxOrigin}/runProgram?entry=${encodeURIComponent(entry)}&csp=${encodeURIComponent(`default-src 'self' ${location.origin};`)}`
        programContainer.appendChild(programFrame)
        return /*() => {
            if (import.meta.env.PROD) {
                window.removeEventListener("message", extensionListener.current)
            }
        }*/
    }, [extensionEntry])

    return <div>
        {error ? <>
            <div className="relative text-center z-10 w-screen h-screen flex justify-center items-center">
                <div className="w-full">
                    <div className="mb-5 text-6xl text-yellow-500">
                        <FontAwesomeIcon icon={faSadTear}/>
                    </div>

                    <div className="mb-3">
                        <div className="text-xl text-neutral-100 mb-2">
                            {errorMessage}
                        </div>
                        <div className="text-xs text-neutral-500">
                            Check browser console for more info
                        </div>
                    </div>
                    
                    <div>
                        <Tooltip title="Back To Start Menu">
                        <Link to="/start">
                            <Button>
                                back
                            </Button>
                        </Link>
                        </Tooltip>
                    </div>
                </div>
            </div>
        </> : <></>}
        
        <FullScreenLoadingOverlay loading={loading}>
            <div 
                id="program-frame-container"
                className="z-0 fixed left-0 top-0 w-screen h-screen overflow-clip"
            />
        </FullScreenLoadingOverlay>
    </div>
}

export default ExtensionShellPage