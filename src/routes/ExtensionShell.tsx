import {useSearchParams, Link, useNavigate} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear} from "@fortawesome/free-solid-svg-icons"
import {Button, Tooltip} from "@mui/material"
import {wRpc} from "../lib/wRpc/simple"
import {EXTENSION_SHELL_TARGET} from "../lib/utils/searchParameterKeys"
import {useAppContext} from "./store"
import {
    HuzmaManifest, 
    NULL_FIELD as CARGO_NULL_FIELD, 
    NULL_FIELD
} from "huzma"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {ExtensionLoadingScreen} from "../components/extensions/ExtensionLoading"
import rawCssExtension from "../index.css?url"
import type {Permissions} from "../lib/types/permissions"
import {
    generatePermissionsSummary, 
    hasUnsafePermissions
} from "../lib/utils/security/permissionsSummary"
import {ALLOW_UNSAFE_PACKAGES} from "../lib/utils/localStorageKeys"
import {SandboxFunctions, JsSandbox} from "../lib/jsSandbox/index"
import { CACHED, ManifestIndex } from "../lib/shabah/backend"

export type ExtensionShellFunctions = SandboxFunctions
export type ControllerRpc = wRpc<ExtensionShellFunctions>

const EXTENSION_IFRAME_ID = "extension-frame"
const NO_EXTENSION_URL = ""
const IFRAME_CONTAINER_ID = "extension-iframe-container"

const ExtensionShellPage = () => {
    const {
        downloadClient, 
        sandboxInitializePromise, 
        database,
        logger
    } = useAppContext()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const confirm = useGlobalConfirm()

    const [error, setError] = useState(false)
    const [showRestartExtension, setShowRestartExtension] = useState(true)
    const [errorMessage, setErrorMessage] = useState("An error occurred...")
    const [loading, setLoading] = useState(true)
    const [extensionEntry, setExtensionEntry] = useState({url: "", retry: 0})

    const errorDetailsRef = useRef("")
    const extensionCargo = useRef(new HuzmaManifest<Permissions>())
    const extensionCargoIndex = useRef<ManifestIndex>({
        tag: -1,
        name: "tmp",
        downloadId: "",
        logo: NULL_FIELD,
        resolvedUrl: "",
        canonicalUrl: "",
        bytes: 0,
        entry: NULL_FIELD,
        version: "0.1.0",
        permissions: [],
        state: CACHED,
        created: 0,
        updated: 0,
        manifestName: ""
    })
    const sandbox = useRef<JsSandbox | null>(null)
    const cleanupExtension = useRef(() => {
        setShowRestartExtension(false)
        if (sandbox.current) {
            sandbox.current.destroy()
        }
        logger.info("All extension resouces cleaned up")
    })
    const appendSandboxToDom = useRef(async (sandboxContainer: HTMLElement) => {
        const jsSandbox = sandbox.current
        if (!jsSandbox) {
            return
        }
        const sandboxDomElement = await jsSandbox.initialize()
        sandboxDomElement.style.width = "100%"
        sandboxDomElement.style.height = "100%"

        // open program frame
        sandboxContainer.appendChild(sandboxDomElement)
    })

    const closeExtension = async () => {
        if (!await confirm({title: "Are you sure you want to return to main menu?", confirmButtonColor: "warning"})) {
            return
        }
        navigate("/start")
    }

    useEffectAsync(async () => {
        const url = searchParams.get(EXTENSION_SHELL_TARGET) || NO_EXTENSION_URL
        const canonicalUrl = decodeURIComponent(url)

        if (canonicalUrl.length < 1) {
            logger.warn(`a query parameter "entry" must be included in url to run an extension.`)
            setLoading(false)
            setError(true)
            setErrorMessage("Files Not Found")
            return
        }

        const meta = await downloadClient.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        if (!meta) {
            logger.warn(`extension "${canonicalUrl}" doesn't exist.`)
            setLoading(false)
            setError(true)
            setErrorMessage("Files Not Found")
            return
        }

        if (meta.state !== CACHED || meta.entry === CARGO_NULL_FIELD) {
            setLoading(false)
            setError(true)
            setErrorMessage("Invalid File")
            logger.warn(`Prevented extension "${canonicalUrl}" from running because extension is not in cached on disk (current_state=${meta.state})`)
            return
        }

        const cargoResponse = await downloadClient.getCargoAtUrl(
            meta.canonicalUrl
        )
        if (cargoResponse.ok) {
            await sandboxInitializePromise.promise
            extensionCargo.current = cargoResponse.data.pkg as HuzmaManifest<Permissions>
            extensionCargoIndex.current = meta
            const url = meta.resolvedUrl + meta.entry
            setExtensionEntry({url, retry: 0})
            return
        }

        setError(true)
        setErrorMessage("Files Not Found")
        logger.error("extension exists in index, but was not found")
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
            logger.error("couldn't find extension container")
            setLoading(false)
            return
        }
        const sandboxElement = sandbox.current
        const sandboxAlreadyLoaded = sandboxElement
            ? !!(document.getElementById(sandboxElement.domElement().id))
            : false
        if (sandboxAlreadyLoaded) {
            logger.warn("Sandbox refused to load because another extension sandbox already exists")
            return
        }
        const unsafeCargosDisallowed = !localStorage.getItem(ALLOW_UNSAFE_PACKAGES)
        const permissionsSummary = generatePermissionsSummary(
            extensionCargo.current.permissions
        )
        const isUnsafe = (
            unsafeCargosDisallowed
            && hasUnsafePermissions(permissionsSummary)
            && extensionCargoIndex.current.canonicalUrl !== import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL
        )

        if (isUnsafe) {
            setError(true)
            setErrorMessage("Fatal Error Occurred")
            logger.error("Blocked UNSAFE cargo from starting")
            return
        }

        const jsSandbox = new JsSandbox({
            entryUrl: extensionEntry.url,
            id: EXTENSION_IFRAME_ID,
            name: `${extensionCargo.current.name}-sandbox`,
            downloadClient,
            dependencies: {
                logger,
                origin: window.location.origin,
                displayExtensionFrame: () => {
                    setLoading(false)
                },
                database,
                minimumLoadTime: 10_000,
                queryState: searchParams.get("state") || "",
                createFatalErrorMessage: (msg, details) => {
                    errorDetailsRef.current = details
                    setErrorMessage(msg)
                    setShowRestartExtension(true)
                    setError(true)
                },
                confirmExtensionExit: closeExtension,
                cargo: extensionCargo.current,
                cargoIndex: extensionCargoIndex.current,
                recommendedStyleSheetUrl: rawCssExtension,
                downloadClient
            },
        })
        sandbox.current = jsSandbox
        appendSandboxToDom.current(extensionFrameContainer)
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
                        {errorDetailsRef.current.length < 1 ? <>
                            <div className="text-xs text-neutral-500">
                                Check browser console for more info
                            </div>
                        </> : <div className="w-4/5 mx-auto">
                            <div className="text-sm mb-2 text-neutral-400">
                                {errorDetailsRef.current}
                            </div>

                            <div className="text-sm text-neutral-500">
                                Check console for more info
                            </div>
                        </div>}
                        
                    </div>
                    
                    <div>
                        {showRestartExtension ? <>
                            <Button
                                onClick={() => {
                                    cleanupExtension.current()
                                    setError(false)
                                    setLoading(true)
                                    setExtensionEntry((old) => ({
                                        ...old,
                                        retry: old.retry + 1
                                    }))
                                }}
                            >
                                Restart
                            </Button>
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