import {Link, useNavigate} from "react-router-dom"
import {useEffect, useRef, useState} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear} from "@fortawesome/free-solid-svg-icons"
import {Button, Tooltip} from "@mui/material"
import {EXTENSION_SHELL_TARGET} from "../lib/utils/searchParameterKeys"
import {useAppContext} from "./store"
import {
	HuzmaManifest, 
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
import {CACHED} from "../lib/shabah/backend"
import {GAME_EXTENSION_CARGO} from "../standardCargos"
import {useSearchParams} from "../hooks/searchParams"
import {ManifestIndex, Shabah} from "../lib/shabah/downloadClient"
import {DeepReadonly} from "../lib/types/utility"
import {removeZipExtension} from "../lib/utils/urls/removeZipExtension"
import {ExtensionApis} from "zakhaarif-dev-tools"
import {sleep} from "../lib/utils/sleep"
import {nanoid} from "nanoid"
import {AppDatabase} from "../lib/database/AppDatabase"
import {Logger} from "../lib/types/app"
import {
	ExtensionFrameId, 
	ExtensionContextObject, 
	ZakhaarifApisField,
	ExtensionContextId,
	ExtensionRootId
} from "../lib/consts"
import extensionStartUrl from "../lib/extensionStart?url"

const EXTENSION_CONTAINER_ID = "extension-app-root"

export default function ExtensionShellPage(): JSX.Element {
	const {
		downloadClient, 
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

	const closeExtension = async () => {
		if (!await confirm({title: "Are you sure you want to return to main menu?", confirmButtonColor: "warning"})) {
			return false
		}
		navigate("/start")
		return true
	}

	useEffectAsync(async () => {
		const url = searchParams.get(EXTENSION_SHELL_TARGET) || ""
		const canonicalUrl = decodeURIComponent(url)

		if (canonicalUrl.length < 1) {
			logger.warn("a query parameter \"entry\" must be included in url to run an extension.")
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

		if (meta.state !== CACHED || meta.entry === NULL_FIELD) {
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
			extensionCargo.current = cargoResponse.data.pkg as HuzmaManifest<Permissions>
			extensionCargoIndex.current = meta
			const entryResolvedUrl = meta.resolvedUrl + meta.entry
			setExtensionEntry({
				url: entryResolvedUrl, 
				retry: 0
			})
			return
		}

		setError(true)
		setErrorMessage("Files Not Found")
		logger.error("extension exists in index, but was not found")
		setLoading(false)
		return () => {
			setParentReplContext(null)
			setExtensionArgs(null)
		}
	}, [])

	useEffect(() => {
		if (extensionEntry.url.length < 1) {
			return
		}
		const extensionFrameContainer = document.getElementById(EXTENSION_CONTAINER_ID)
		if (!extensionFrameContainer) {
			setError(true)
			setErrorMessage("Fatal Error Occurred")
			logger.error("couldn't find extension container")
			setLoading(false)
			return
		}
		if (sandbox.current?.initialized) {
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
            && extensionCargoIndex.current.canonicalUrl !== GAME_EXTENSION_CARGO.canonicalUrl
		)

		if (isUnsafe) {
			setError(true)
			setErrorMessage("Fatal Error Occurred")
			logger.error("Blocked UNSAFE cargo from starting")
			return
		}

		const rootElement = document.getElementById(EXTENSION_CONTAINER_ID)
		
		if (!rootElement) {
			logger.error("couldn't find root element")
			return
		}
		
		const jsSandbox = new JsSandbox({
			rootElement: rootElement as HTMLElement,
			entryUrl: extensionEntry.url,
			name: `${extensionCargo.current.name}-sandbox`,
			downloadClient,
			dependencies: {
				logger,
				origin: window.location.origin,
				displayExtensionFrame: () => {
					setLoading(false)
				},
				database,
				minimumLoadTime: 5_000,
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
		jsSandbox.initialize()
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
			id={EXTENSION_CONTAINER_ID}
			className={`${error || loading ? "hidden" : ""} z-0 animate-fade-in-left fixed left-0 top-0 w-screen h-screen overflow-clip`}
		/>

		{!error && loading ? <ExtensionLoadingScreen 
			onClose={closeExtension}
			isRetry={extensionEntry.retry > 0}
		/> : <></>}
        
	</div>
}

const AUTH_TOKEN_LENGTH = 20

type SandboxMutableState = {
	readyForDisplay: boolean
	minimumLoadTimePromise: Promise<boolean>
	fatalErrorOccurred: boolean
	authToken: string
}

type SandboxDependencies = DeepReadonly<{
    displayExtensionFrame: () => void
    minimumLoadTime: number
    queryState: string
    createFatalErrorMessage: (msg: string, details: string) => void
    confirmExtensionExit: () => Promise<boolean>
    cargoIndex: ManifestIndex
    cargo: HuzmaManifest<Permissions>
    recommendedStyleSheetUrl: string
    database: AppDatabase
    origin: string
    logger: Logger
    downloadClient: Shabah
}>

export type JsSandboxOptions = {
    entryUrl: string
    dependencies: SandboxDependencies
    name: string
    downloadClient: Shabah
	rootElement: HTMLElement | null
}

export class JsSandbox {
	private state: SandboxMutableState
	readonly dependencies: SandboxDependencies
	initialized = false
	private iframeElement = null as HTMLIFrameElement | null
    
	domElement: HTMLElement | null
	readonly name: string
	readonly entry: string
	readonly downloadClient: DeepReadonly<Shabah>

	constructor(config: JsSandboxOptions) {
		this.domElement = config.rootElement
		this.downloadClient = config.downloadClient
		this.dependencies = config.dependencies
		this.state = {
			readyForDisplay: false,
			minimumLoadTimePromise: sleep(config.dependencies.minimumLoadTime),
			fatalErrorOccurred: false,
			authToken: nanoid(AUTH_TOKEN_LENGTH)
		}
		this.entry = removeZipExtension(config.entryUrl)
		this.name = config.name
	}

	async initialize() {
		const {entry, dependencies} = this
		const {logger,} = dependencies
		const apis = createExtensionApis(dependencies, this.state)
		setExtensionArgs(apis)
		const iframe = document.createElement("iframe")
		const frameId: ExtensionFrameId = "extension-frame"
		iframe.id = frameId
		iframe.title = "extension-iframe"
		iframe.name = "extension-document"
		const extensionContext: ExtensionContextObject = {
			queryState: dependencies.queryState,
			rootUrl: dependencies.cargoIndex.resolvedUrl,
			recommendedStyleSheetUrl: `${dependencies.origin}/${dependencies.recommendedStyleSheetUrl}`,
			entryUrl: entry,
		}
		const extensionIgniteUrl = new URL(extensionStartUrl, import.meta.url)
		const contextId: ExtensionContextId = "extension-context-node"
		const rootId: ExtensionRootId = "extension-root"
		const iframedoc = `<!DOCTYPE html>
		<html lang="en">
		  <head>
			<meta charset="UTF-8" />
			<meta id="${contextId}" content='${JSON.stringify(extensionContext)}' />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		  </head>
		  <body>
			<div id="${rootId}"></div>
			<script type="module" src="${extensionIgniteUrl.href}"></script>
		  </body>
		</html>`
		logger.info("starting extension frame...")
		iframe.srcdoc = iframedoc
		iframe.style.width = "100%"
		iframe.style.height = "100%"
		if (this.domElement) {
			this.domElement.appendChild(iframe)
		}
		this.initialized = true
		logger.info("extension frame initialized")
	}

	destroy(): boolean {
		if (this.iframeElement) {
			this.iframeElement.remove()
		}
		setParentReplContext(null)
		if (!import.meta.env.DEV) {
			setExtensionArgs(null)
		}
		this.dependencies.logger.info(`cleaned up all resources associated with sandbox "${this.name}"`)
		return true
	}
}

function createExtensionApis(
	dependencies: SandboxDependencies,
	state: SandboxMutableState
): ExtensionApis {
	return {
		addToParentReplContext: setParentReplContext,
		signalFatalError: (config) => {
			state.fatalErrorOccurred = true
			dependencies.logger.error("extension encountered fatal error")
			dependencies.createFatalErrorMessage(
				"Encountered a fatal error", config.details
			)
			return true
		},
		readyForDisplay: () => {
			if (state.readyForDisplay || state.fatalErrorOccurred) {
				return false
			}
			dependencies.logger.info("Extension requested to render display")
			state.readyForDisplay = true
			state.minimumLoadTimePromise.then(() => {
				dependencies.logger.info("rendering extension frame")
				dependencies.displayExtensionFrame()
			})
			return true
		},
		getSaveFile: async (id) => {
			if (id < 0) {
				return await dependencies.database.gameSaves.latest() || null
			}
			return await dependencies.database.gameSaves.getById(id) || null
		},
		exitExtension: async (_) => {
			return await dependencies.confirmExtensionExit()
		}
	}
}

function setParentReplContext(value: unknown): boolean {
	if (typeof window === "undefined") {
		return false
	}
	const zakhaarifExtension = "zext"
	Object.defineProperty(window, zakhaarifExtension, {
		value: value,
		configurable: true,
		writable: false,
		enumerable: true
	})
	return true
}

function setExtensionArgs(
	args: ExtensionApis | null
): boolean {
	if (typeof window === "undefined") {
		return false
	}
	const zakhaarifArguments: ZakhaarifApisField = "yzapis"
	Object.defineProperty(window, zakhaarifArguments, {
		value: args,
		configurable: true,
		writable: false,
		enumerable: true
	})
	return true
}