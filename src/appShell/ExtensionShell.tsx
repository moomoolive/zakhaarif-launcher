import {useSearchParams, Link, useNavigate} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear, faCreditCard, faHandPointDown} from "@fortawesome/free-solid-svg-icons"
import {Button, Tooltip} from "@mui/material"
import {wRpc} from "../lib/wRpc/simple"
import {
    GAME_EXTENSION_ID, 
    MOD_CARGO_ID_PREFIX,
    ADDONS_EXENSTION_ID
} from "../config"
import {useAppShellContext} from "./store"
import {CargoIndex} from "../lib/shabah/wrapper"
import {GAME_CARGO, GAME_CARGO_INDEX} from "../standardCargos"
import {Cargo} from "../lib/cargo/index"
import {APP_CACHE} from "../config"
import LoadingIcon from "../components/LoadingIcon"
import {sleep} from "../lib/utils/sleep"
import {useGlobalConfirm} from "../hooks/globalConfirm"

const EXTENSION_LOADING_MESSAGES = [
    {
        icon: <div className="text-green-500">
            <FontAwesomeIcon icon={faHandPointDown}/>
        </div>,
        text: "Click the bottom right corner of screen to close extension at any time"
    },
    {
        icon: <div className="text-yellow-500">
            <FontAwesomeIcon icon={faCreditCard}/>
        </div>,
        text: "Never enter sensitive information into extensions (credit cards, passwords, etc.)"
    },
] as const

type ExtensionLoadingScreenProps = {
    onClose: () => Promise<void>
}

const ExtensionLoadingScreen = ({onClose}: ExtensionLoadingScreenProps) => {
    const [messageIndex, setMessageIndex] = useState(0)

    useEffect(() => {
        const milliseconds = 5_000
        let currentMessageIndex = messageIndex
        const timerId = window.setInterval(() => {
            if (currentMessageIndex + 1 < EXTENSION_LOADING_MESSAGES.length) {
                currentMessageIndex = currentMessageIndex + 1
            } else {
                currentMessageIndex = 0
            }
            currentMessageIndex = Math.max(0, currentMessageIndex)
            setMessageIndex(currentMessageIndex)
        }, milliseconds)
        return () => window.clearTimeout(timerId)
    }, [])

    return <div className="fixed z-20 w-screen h-screen top-0 left-0 flex items-center flex-col justify-center">
        <div className="w-full h-1/2 flex items-end justify-center">
            <div className="mb-5">
                <div className="text-6xl text-blue-500 animate-spin">
                    <LoadingIcon/>
                </div>
            </div>
        </div>
        
        <div className="w-full h-1/2 flex items-start justify-center">
            <div>
                <div className="mb-2 text-center">
                    {"Starting extension..."}
                </div>
                <div className="w-3/5 max-w-xs mx-auto flex justify-center">
                    <div className="mr-4 mt-1">
                        {EXTENSION_LOADING_MESSAGES[messageIndex].icon}
                    </div>
                    <div className="text-xs text-neutral-400">
                        {EXTENSION_LOADING_MESSAGES[messageIndex].text}
                    </div>
                </div>
            </div>
        </div>

        <button 
            className="absolute animate-pulse bottom-0 right-0 rounded-full bg-green-500 w-8 h-8 mr-2 mb-2"
            onClick={onClose}    
        />
    </div>
}

type RpcStateDependencies = {
    displayExtensionFrame: () => void
    minimumLoadTime: number
}

const createRpcState = (dependencies: RpcStateDependencies) => {
    const {minimumLoadTime} = dependencies
    return {
        ...dependencies,
        readyForDisplay: false,
        secureContextEstablished: false,
        minimumLoadTimePromise: sleep(minimumLoadTime)
    }
}

const createRpcFunctions = (state: ReturnType<typeof createRpcState>) => {
    return {
        getFile: async (url: string) => {
            const cache = await caches.open(APP_CACHE)
            const file = await cache.match(url)
            if (!file || !file.body) {
                return null
            }
            const type = file.headers.get("content-type") || "text/plain"
            const length = file.headers.get("content-length") || "0"
            const transfer = {type, length, body: file.body} as const
            return wRpc.transfer(transfer, [file.body])
        },
        contextEstablished: () => {
            state.secureContextEstablished = true
            return true
        },
        readyForDisplay: () => {
            if (state.readyForDisplay) {
                return false
            }
            console.info("Extension requested to show display")
            state.readyForDisplay = true
            state.minimumLoadTimePromise.then(() => {
                console.info("Opening extension frame")
                state.displayExtensionFrame()
            })
            return true
        }
    } as const
}

export type ExtensionShellFunctions = ReturnType<typeof createRpcFunctions>
export type ControllerRpc = wRpc<ExtensionShellFunctions>

const sanboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
const EXTENSION_IFRAME_ID = "extension-frame"
const NO_EXTENSION_ID = ""
const IFRAME_CONTAINER_ID = "extension-iframe"

const ExtensionShellPage = () => {
    const {downloadClient} = useAppShellContext()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const confirm = useGlobalConfirm()

    const [error, setError] = useState(false)
    const [errorMessage, setErrorMessage] = useState("An error occurred...")
    const [loading, setLoading] = useState(true)
    const [extensionEntry, setExtensionEntry] = useState("")
    
    const iframeRpc = useRef<null | ControllerRpc>(null)
    const extensionCargo = useRef(new Cargo())
    const extensionIframe = useRef<null | HTMLIFrameElement>(null)
    const extensionListener = useRef<(_: MessageEvent) => any>(() => {})
    const extensionInitialState = useRef("")
    const rpcState = useRef(createRpcState({
        displayExtensionFrame: () => {
            setLoading(false)
        },
        minimumLoadTime: 10_000
    }))

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

        if (extensionId === ADDONS_EXENSTION_ID) {
            navigate("/add-ons")
            return
        }

        if (extensionId === GAME_EXTENSION_ID) {
            setExtensionEntry(GAME_CARGO_INDEX.entry)
            extensionCargo.current = GAME_CARGO
            return
        }

        let meta: CargoIndex | null
        if (
            extensionId.length > 0 
            && (meta = await downloadClient.getCargoMeta(extensionId))
        ) {
            const cargoResponse = await downloadClient.getCargoAtUrl(
                meta.storageRootUrl
            )
            if (cargoResponse.ok) {
                extensionCargo.current = cargoResponse.data.pkg
                setExtensionEntry(meta.entry)
                return
            }
            setError(true)
            setErrorMessage("Extension Not Found")
            console.error("extension exists in index, but was not found")
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

    const closeExtension = async () => {
        if (!await confirm({title: "Are you sure you want to close this extension?"})) {
            return
        }
        navigate("/start")
    }

    useEffect(() => {
        if (extensionEntry.length < 1) {
            return
        }
        const extensionFrameContainer = document.getElementById(IFRAME_CONTAINER_ID)
        if (!extensionFrameContainer) {
            setError(true)
            setErrorMessage("Fatal Error Occurred")
            console.error("couldn't find extension container")
            setLoading(false)
            return
        }
        const extensionIframeExists = document.getElementById(EXTENSION_IFRAME_ID)
        if (extensionIframeExists) {
            return
        }
        const entry = extensionEntry
        const extensionFrame = document.createElement("iframe")
        extensionFrame.allow = ""
        extensionFrame.name = "extension-frame"
        extensionFrame.id = EXTENSION_IFRAME_ID
        extensionFrame.setAttribute("sandbox", "allow-scripts allow-same-origin")
        extensionFrame.width = "100%"
        extensionFrame.height = "100%"
        iframeRpc.current = new wRpc({
            responses: createRpcFunctions(rpcState.current),
            messageTarget: {
                postMessage: (data, transferables) => {
                    extensionFrame.contentWindow?.postMessage(
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
        extensionFrame.src = `${sanboxOrigin}/runProgram?entry=${encodeURIComponent(entry)}&csp=${encodeURIComponent(`default-src 'self' ${location.origin};`)}`
        extensionIframe.current = extensionFrame
        extensionFrameContainer.appendChild(extensionFrame)
        return () => {
            window.removeEventListener("message", extensionListener.current)
            iframeRpc.current = null
            extensionFrameContainer.removeChild(extensionFrame)
            extensionIframe.current = null
            console.log("All extension resouces cleaned up")
        }
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

        
        <div 
            id={IFRAME_CONTAINER_ID}
            className={`${loading ? "hidden" : ""} z-0 animate-fade-in-left fixed left-0 top-0 w-screen h-screen overflow-clip`}
        >
            <button 
                className="absolute animate-pulse bottom-0 right-0 w-10 h-10"
                onClick={closeExtension}    
            />
        </div>

        {loading ? <ExtensionLoadingScreen 
            onClose={closeExtension}
        /> : <></>}
        
    </div>
}

export default ExtensionShellPage