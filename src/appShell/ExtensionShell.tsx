import {useSearchParams, Link, useNavigate} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear} from "@fortawesome/free-solid-svg-icons"
import {Button, Tooltip} from "@mui/material"
import {wRpc} from "../lib/wRpc/simple"
import {GAME_EXTENSION_ID, MOD_CARGO_ID_PREFIX} from "../config"
import {useAppShellContext} from "./store"
import {GAME_CARGO, GAME_CARGO_INDEX} from "../standardCargos"
import {Cargo} from "../lib/cargo/index"
import {APP_CACHE} from "../config"
import {sleep} from "../lib/utils/sleep"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {ExtensionLoadingScreen} from "../components/extensions/ExtensionLoading"
import {nanoid} from "nanoid"
import type {CargoIndex} from "../lib/shabah/wrapper"
import type {DeepReadonly} from "../lib/types/utility"
import {AppDatabase} from "../lib/database/AppDatabase"
import rawCssExtension from "../index.css?url"

type RpcStateDependencies = DeepReadonly<{
    displayExtensionFrame: () => void
    minimumLoadTime: number
    queryState: string
    authToken: string
    createFatalErrorMessage: (msg: string) => void
    confirmExtensionExit: () => Promise<void>
    cargoIndex: {current: CargoIndex}
    cargo: {current: Cargo}
}>

const createRpcState = (dependencies: RpcStateDependencies) => {
    const {minimumLoadTime} = dependencies
    const mutableState = {
        readyForDisplay: false,
        secureContextEstablished: false,
        minimumLoadTimePromise: sleep(minimumLoadTime),
        fatalErrorOccurred: false,
        database: new AppDatabase()
    }
    type RpcMutableState = typeof mutableState
    type RpcState = RpcStateDependencies & RpcMutableState
    return {...dependencies, ...mutableState} as RpcState
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
        getInitialState: () => {
            if (state.secureContextEstablished) {
                return null
            }
            const {queryState, authToken, cargoIndex} = state
            const {resolvedUrl} = cargoIndex.current
            const cssExtension = rawCssExtension.startsWith("/")
                ? rawCssExtension.slice(1)
                : rawCssExtension
            return {
                queryState, 
                authToken, 
                rootUrl: resolvedUrl,
                recommendedStyleSheetUrl: `${window.location.origin}/${cssExtension}`
            }
        },
        secureContextEstablished: () => {
            state.secureContextEstablished = true
            return true
        },
        signalFatalError: (extensionToken: string) => {
            if (
                state.secureContextEstablished 
                && extensionToken !== state.authToken
            ) {
                console.warn("application signaled fatal error but provided wrong auth token")
                return false
            }
            state.fatalErrorOccurred = true
            console.log("extension encountered fatal error")
            state.createFatalErrorMessage("Extension encountered a fatal error")
            return true
        },
        readyForDisplay: () => {
            if (
                state.readyForDisplay 
                || state.fatalErrorOccurred
            ) {
                return false
            }
            console.info("Extension requested to show display")
            state.readyForDisplay = true
            state.minimumLoadTimePromise.then(() => {
                console.info("Opening extension frame")
                state.displayExtensionFrame()
            })
            return true
        },
        exit: async (extensionToken: string) => {
            if (
                state.fatalErrorOccurred 
                || extensionToken !== state.authToken
            ) {
                return false
            }
            await state.confirmExtensionExit()
            return true
        },
        async getSaveFile(id: number) {
            if (id < 0) {
                return await state.database.gameSaves.latest()
            }
            return await state.database.gameSaves.getById(id)
        },
    } as const
}

export type ExtensionShellFunctions = ReturnType<typeof createRpcFunctions>
export type ControllerRpc = wRpc<ExtensionShellFunctions>

const sanboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
const EXTENSION_IFRAME_ID = "extension-frame"
const NO_EXTENSION_ENTRY = ""
const IFRAME_CONTAINER_ID = "extension-iframe"
const MINIMUM_AUTH_TOKEN_LENGTH = 20
const AUTH_TOKEN_LENGTH = (() => {
    const additionalLength = Math.trunc(Math.random() * 20)
    return MINIMUM_AUTH_TOKEN_LENGTH + additionalLength
})()

const ExtensionShellPage = () => {
    const {downloadClient} = useAppShellContext()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const confirm = useGlobalConfirm()

    const [error, setError] = useState(false)
    const [showRestartExtension, setShowRestartExtension] = useState(true)
    const [errorMessage, setErrorMessage] = useState("An error occurred...")
    const [loading, setLoading] = useState(true)
    const [extensionEntry, setExtensionEntry] = useState({url: "", retry: 0})

    const closeExtension = async () => {
        if (!await confirm({title: "Are you sure you want to close this extension?", confirmButtonColor: "warning"})) {
            return
        }
        navigate("/start")
    }
    
    const iframeRpc = useRef<null | ControllerRpc>(null)
    const extensionCargo = useRef(new Cargo())
    const extensionCargoIndex = useRef(GAME_CARGO_INDEX)
    const extensionIframe = useRef<null | HTMLIFrameElement>(null)
    const extensionListener = useRef<(_: MessageEvent) => any>(() => {})
    const extensionInitialState = useRef("")

    const rpcStateFactory = useRef(() => createRpcState({
        displayExtensionFrame: () => {
            setLoading(false)
        },
        minimumLoadTime: 10_000,
        queryState: searchParams.get("state") || "",
        authToken: nanoid(AUTH_TOKEN_LENGTH),
        createFatalErrorMessage: (msg) => {
            setErrorMessage(msg)
            setShowRestartExtension(true)
            setError(true)
        },
        confirmExtensionExit: closeExtension,
        cargo: extensionCargo,
        cargoIndex: extensionCargoIndex
    }))

    const rpcState = useRef(rpcStateFactory.current())
    const cleanupExtension = useRef(() => {
        setShowRestartExtension(false)
        window.removeEventListener("message", extensionListener.current)
        iframeRpc.current = null
        const extensionFrameContainer = document.getElementById(IFRAME_CONTAINER_ID)
        if (extensionFrameContainer && extensionIframe.current) {
            extensionFrameContainer.removeChild(extensionIframe.current)
        }
        extensionIframe.current = null
        console.log("All extension resouces cleaned up")
    })

    useEffectAsync(async () => {
        const entry = searchParams.get("entry") || NO_EXTENSION_ENTRY
        extensionInitialState.current = searchParams.get("state") || ""
        const entryUrl = decodeURIComponent(entry)

        if (entryUrl.length < 1) {
            console.warn(`a query parameter "entry" must be included in url to run an extension.`)
            setLoading(false)
            setError(true)
            setErrorMessage("Extension Not Found")
            return
        }

        if (entryUrl === GAME_CARGO_INDEX.entry) {
            setExtensionEntry({url: GAME_CARGO_INDEX.entry, retry: 0})
            extensionCargoIndex.current = GAME_CARGO_INDEX
            extensionCargo.current = GAME_CARGO
            return
        }

        const meta = await downloadClient.getCargoMetaByEntry(entryUrl)
        if (!meta) {
            console.warn(`extension "${entryUrl}" doesn't exist.`)
            setLoading(false)
            setError(true)
            setErrorMessage("Extension Not Found")
            return
        }

        if (meta.id.startsWith(MOD_CARGO_ID_PREFIX)) {
            setLoading(false)
            setError(true)
            setErrorMessage("Invalid Extension")
            console.warn(`Prevented mod "${entryUrl}" from running. Mods cannot be run as standalone extensions and only run when embedded in the game extension (id="${GAME_EXTENSION_ID}")`)
            return
        }

        const cargoResponse = await downloadClient.getCargoAtUrl(meta.resolvedUrl)
        if (cargoResponse.ok) {
            extensionCargo.current = cargoResponse.data.pkg
            extensionCargoIndex.current = meta
            setExtensionEntry({url: meta.entry, retry: 0})
            return
        }

        setError(true)
        setErrorMessage("Extension Not Found")
        console.error("extension exists in index, but was not found")
        setLoading(false)
    }, [])

    useEffect(() => {
        if (extensionEntry.url.length < 1) {
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
        const entry = extensionEntry.url
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
        return cleanupExtension.current
    }, [extensionEntry])

    return <div>
        {error ? <>
            <div className="relative animate-fade-in-left text-center z-10 w-screen h-screen flex justify-center items-center">
                <div className="w-full">
                    <div className="mb-5 text-6xl text-yellow-500">
                        <FontAwesomeIcon icon={faSadTear}/>
                    </div>

                    <div className="mb-3 w-4/5 mx-auto max-w-md">
                        <div className="text-xl text-neutral-100 mb-2">
                            {errorMessage}
                        </div>
                        <div className="text-xs text-neutral-500">
                            Check browser console for more info
                        </div>
                    </div>
                    
                    <div>
                        {showRestartExtension ? <>
                            <Tooltip title="Restart Extension">
                                <Button
                                    onClick={() => {
                                        cleanupExtension.current()
                                        rpcState.current = rpcStateFactory.current()
                                        setError(false)
                                        setLoading(true)
                                        setExtensionEntry((old) => ({
                                            ...old,
                                            retry: old.retry + 1
                                        }))
                                    }}
                                >
                                    restart
                                </Button>
                            </Tooltip>
                        </> : <></>}

                        <Tooltip title="Back To Start Menu">
                            <Link to="/start">
                                <Button color="error">
                                    Close
                                </Button>
                            </Link>
                        </Tooltip>
                    </div>
                </div>
            </div>
        </> : <></>}

        
        <div 
            id={IFRAME_CONTAINER_ID}
            className={`${error || loading ? "hidden" : ""} z-0 animate-fade-in-left fixed left-0 top-0 w-screen h-screen overflow-clip`}
        >
            <button 
                className="absolute animate-pulse bottom-0 right-0 w-10 h-10"
                onClick={closeExtension}    
            />
        </div>

        {!error && loading ? <ExtensionLoadingScreen 
            onClose={closeExtension}
            isRetry={extensionEntry.retry > 0}
        /> : <></>}
        
    </div>
}

export default ExtensionShellPage