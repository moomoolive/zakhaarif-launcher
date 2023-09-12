import {
	BrowserRouter,
	useLocation,
	Routes,
	Route,
} from "react-router-dom"
import {useState, useEffect, useRef} from "react"
import {lazyComponent, LazyComponentOptions, LazyComponent} from "../components/Lazy"
import {AppShellContext} from "./store"
import Launcher from "./Launcher"
import AppLaunch from "./AppLaunch"
import MadeWith from "./MadeWith"
import type { 
	TerminalEngine as TerminalEngineType, 
	CommandDefinition 
} from "../lib/terminalEngine"
import {useEffectAsync} from "../hooks/effectAsync"
import terminalLoadingElement from "../components/loadingElements/terminal"
import {LOCAL_STORAGE_KEYS} from "../lib/consts"
import {Shabah} from "../lib/shabah/downloadClient"
import {webAdaptors} from "../lib/shabah/adaptors/web-preset"
import {
	APP_CACHE, 
	BACKEND_CHANNEL_NAME, 
	DOWNLOAD_CLIENT_CHANNEL_NAME, 
	VIRTUAL_FILE_CACHE
} from "../config"
import {cleanPermissions} from "../lib/utils/security/permissionsSummary"
import type {ServiceWorkerRpcs} from "../../serviceWorkers/rpcs"
import {wRpc} from "w-worker-rpc"
import {AppDatabase} from "../lib/database/AppDatabase"
import {FEATURE_CHECK} from "../lib/utils/featureCheck"
import {
	createBackendChannel, 
	createClientChannel
} from "../lib/utils/shabahChannels"
import {Logger} from "../lib/types/app"
import {DownloadProgressListener, createAppRpcs} from "../lib/util"
import type {SetStateAction} from "react"
import {initCommand} from "../lib/terminalEngine/utility"

const {VERBOSE_LAUNCHER_LOGS} = LOCAL_STORAGE_KEYS

type LazyRouteLoader<T> = () => Promise<{ default: LazyComponent<T> }>

export function lazyRoute<T>(
	loader: LazyRouteLoader<T>,
	options: LazyComponentOptions = {}
) {
	return lazyComponent(
		async () => (await loader()).default, 
		options
	)
}

const StartMenu = lazyRoute(() => import("./StartMenu"))
const ExtensionShell = lazyRoute(() => import("./ExtensionShell"))
const Addons = lazyRoute(() => import("./Addons"))
const Settings = lazyRoute(() => import("./Settings"))
const ExtensionList = lazyRoute(() => import("./ExtensionsList"))
const NewGame = lazyRoute(() => import("./NewGame"))
const LoadGame = lazyRoute(() => import("./LoadGame"))
const NotFound = lazyRoute(() => import("./NotFound"))

const fadeOut = 2
const fadeIn = 1

function PageDisplay(): JSX.Element {
	const location = useLocation()

	const [displayLocation, setDisplayLocation] = useState(location)
	const [transitionStage, setTransitionStage] = useState(fadeIn)

	useEffect(() => {
		if (location.pathname !== displayLocation.pathname) {
			setTransitionStage(fadeOut)
		}
	}, [location, displayLocation])

	return <div
		id="viewing-page"
		// animation taken from https://dev.to/fazliddin04/react-router-v6-animated-transitions-diy-3e6l
		className={transitionStage === fadeIn ? "animate-fade-in-left" : "animate-fade-out-left"}
		onAnimationEnd={() => {
			if (transitionStage === fadeOut) {
				setTransitionStage(fadeIn)
				setDisplayLocation(location)
			}
		}}
	>
		<Routes location={displayLocation}>
			<Route path="/" element={<Launcher/>}/>
			<Route path="/launch" element={<AppLaunch/>}/>
			<Route path="/made-with" element={<MadeWith/>}/>
            
			{
				// lazy loaded routes
			}
			<Route path="*" element={<NotFound/>}/>
			<Route path="/start" element={<StartMenu/>}/>
			<Route path="/extension" element={<ExtensionShell/>}/>
			<Route path="/extensions-list" element={<ExtensionList/>}/>
			<Route path="/add-ons" element={<Addons/>}/>
			<Route path="/settings" element={<Settings/>}/>
			<Route path="/new-game" element={<NewGame/>}/>
			<Route path="/load-game" element={<LoadGame/>}/>
		</Routes>
	</div>
}


const Terminal = lazyComponent(
	async () => (await import("../components/Terminal")).Terminal,
	{loadingElement: terminalLoadingElement}
)

export function AppRouter(): JSX.Element {
	const [showTerminal, setShowTerminal] = useState(false)
	const [terminalEngine, setTerminalEngine] = useState<TerminalEngineType | null>(null)
    
	const {current: globalState} = useRef(new AppStore({
		setTerminalVisibility: setShowTerminal
	}))
	const terminalReadyRef = useRef(false)

	useEffect(() => {
		globalState.initialize()
		return () => { globalState.destroy() }
	}, [])

	useEffectAsync(async () => {
		if (!showTerminal || terminalReadyRef.current) {
			return
		}
		const [terminalLibrary] = await Promise.all([
			import("../lib/terminalEngine/index")
		] as const)
		const {TerminalEngine} = terminalLibrary
		const engine = new TerminalEngine()
		setTerminalEngine(engine)
        
		const commands = createCommands({
			setShowTerminal,
			source: "std",
			setLogState: (silent) => {
				globalState.logger.silent = silent
				localStorage.setItem(VERBOSE_LAUNCHER_LOGS, JSON.stringify(!silent))
			},
			setServiceWorkerLogState: (silent) => {
				globalState.serviceWorkerTerminal.execute("logger", !silent)
			}
		})

		for (let i = 0; i < commands.length; i++) {
			engine.addCommand(
                commands[i] as CommandDefinition
			)
		}
		terminalReadyRef.current = true
	}, [showTerminal])

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key === "`") {
				setShowTerminal((previous) => !previous)
			}
		}
		window.addEventListener("keyup", handler)
		return () => window.removeEventListener("keyup", handler)
	}, [])

	return <BrowserRouter>
        
		{showTerminal ? <>
			<Terminal
				engine={terminalEngine}
				onClose={() => setShowTerminal(false)}
			/>
		</> : <></>}

		<AppShellContext.Provider value={globalState}>
			<PageDisplay/>
		</AppShellContext.Provider>
	</BrowserRouter>
}

export type EventMap = {
    downloadprogress: DownloadProgressListener
}

export type EventName = keyof EventMap

type EventListenerMap = {
    [key in keyof EventMap]: EventListenerRecord<EventMap[key]>
}

export type AppStoreConfig = {
    setTerminalVisibility: (value: boolean) => void
}

export class AppStore {
	setTerminalVisibility: (visible: boolean) => void
	readonly downloadClient: Shabah
	serviceWorkerTerminal: wRpc<ServiceWorkerRpcs, object>
	database: AppDatabase
	readonly browserFeatures: typeof FEATURE_CHECK
	logger: AppLogger

	private eventListenerMap: EventListenerMap
	private globalListeners: Array<{
        event: "service-worker-message",
        handler: (arg: unknown) => unknown
    }>

	constructor(config: AppStoreConfig) {
		const verboseLogs = localStorage.getItem(VERBOSE_LAUNCHER_LOGS)
		this.logger = new AppLogger({
			name: "🐬 App Daemon",
			silent: verboseLogs === null
				? !import.meta.env.DEV
				: verboseLogs !== "true"
		})
		this.browserFeatures = FEATURE_CHECK
		this.setTerminalVisibility  = config.setTerminalVisibility
        
		const database = new AppDatabase()
		this.database = database
        
		this.downloadClient = new Shabah({
			origin: location.origin,
			adaptors: webAdaptors(APP_CACHE, VIRTUAL_FILE_CACHE),
			permissionsCleaner: cleanPermissions,
			indexStorage: database.cargoIndexes,
			clientMessageChannel: createClientChannel(DOWNLOAD_CLIENT_CHANNEL_NAME),
			backendMessageChannel: createBackendChannel(BACKEND_CHANNEL_NAME)
		})

		this.eventListenerMap = {
			downloadprogress: new EventListenerRecord()
		}
		this.globalListeners = []

		const self = this
		this.serviceWorkerTerminal = new wRpc<ServiceWorkerRpcs>({
			responses: createAppRpcs({
				getProgressListeners: () => {
					return self.eventListenerMap.downloadprogress.getAll()
				}
			}),
			messageTarget: {
				postMessage: () => {},
				addEventListener: () => {},
				removeEventListener: () => {}
			},
			state: {}
		})
	}

	initialize(): boolean {
		const self = this
		this.serviceWorkerTerminal.replaceMessageTarget({
			postMessage(data, transferables) {
				const target = navigator.serviceWorker.controller
				if (!target) {
					return
				}
				target.postMessage(data, transferables)
			},
			addEventListener(_, handler) {
				const event = "service-worker-message"
				self.globalListeners.push({event, handler: (handler as (arg: unknown) => unknown)})
				navigator.serviceWorker.addEventListener("message", handler)
			},
			removeEventListener(_, handler) {
				navigator.serviceWorker.removeEventListener("message", handler)
				const mutateIndex = self.globalListeners.findIndex(
					(listener) => listener.handler === handler
				)
				if (mutateIndex > -1) {
					self.globalListeners.splice(mutateIndex, 1)
				}
			}
		})
		return true
	}

	destroy(): boolean {
		for (const {event, handler} of this.globalListeners) {
			switch (event) {
			case "service-worker-message":
				navigator.serviceWorker.removeEventListener(
					"message", 
                        handler as (_: MessageEvent) => unknown
				)
				break
			default:
				break
			}
		}
		return true
	}

	addEventListener<Name extends EventName>(
		name: Name, handler: EventMap[Name]
	): number {
		return this.eventListenerMap[name].addEventListener(handler)
	}

	removeEventListener(name: EventName, handlerId: number): boolean {
		return this.eventListenerMap[name].removeEventListener(handlerId)
	}

}

type AppLoggerConfig = {
    silent: boolean
    name: string
}

class AppLogger implements Logger {
	silent: boolean
	name: string

	constructor(config: AppLoggerConfig) {
		const {silent, name} = config
		this.silent = silent
		this.name = name
	}

	private prefix() {
		return `[${this.name}]`
	}

	isSilent(): boolean {
		return this.silent
	}

	info(...messages: unknown[]): void {
		if (!this.silent) {
			console.info(this.prefix(), ...messages)
		}
	}

	warn(...messages: unknown[]): void {
		console.warn(this.prefix(), ...messages)
	}

	error(...messages: unknown[]): void {
		console.error(this.prefix(), ...messages)
	}
}

type TerminalDependencies = {
    setShowTerminal: (val: SetStateAction<boolean>) => unknown
    source: string
    setLogState: (silent: boolean) => unknown,
    setServiceWorkerLogState: (silent: boolean) => unknown
}

function createCommands(deps: TerminalDependencies) {
	const {
		setShowTerminal,
		source,
		setLogState,
		setServiceWorkerLogState
	} = deps

	const list = initCommand({
		name: "list",
		fn: (output, {allCommands}) => {
			const cmdsHtml = allCommands.reduce((total, {name}) => {
				return total + `<div style="margin-right: 1rem;">${name}</div>`
			}, "")
			output.info(`<div style="width: 100%;display: flex;flex-wrap: wrap;color: pink;">${cmdsHtml}</div>`)
		},
		source
	})

	const exit = initCommand({
		name: "exit",
		fn: (output) => {
			output.info("goodbye")
			setTimeout(() => setShowTerminal(false), 400)
		},
		source
	})

	const frogger = initCommand({
		name: "frogger",
		fn: (output, {parsedInputs}) => {
			const {verboseAppLogs, verboseServiceWorkerLogs} = parsedInputs
			if (verboseAppLogs === 1) {
				setLogState(false)
				output.info("[🐸 Frogger]: Set app logs to verbose mode.")
			} else if (verboseAppLogs === 0) {
				output.info("[🐸 Frogger]: Set app logs to silent mode.")
				setLogState(true)
			}

			if (verboseServiceWorkerLogs === 1) {
				setServiceWorkerLogState(false)
				output.info("[🐸 Frogger]: Set service worker logs to verbose mode.")
			} else if (verboseServiceWorkerLogs === 0) {
				output.info("[🐸 Frogger]: Set service worker logs to silent mode.")
				setServiceWorkerLogState(true)
			}

			if (isNaN(verboseAppLogs) && isNaN(verboseServiceWorkerLogs)) {
				output.warn("[🐸 Frogger]: No options were entered!")
			}
		},
		inputs: {
			verboseAppLogs: "int?",
			verboseServiceWorkerLogs: "int?"
		},
		documentation: async () => {
			const options = [
				{name: "verboseAppLogs", text: "set to 1 for verbose logs and 0 to silence non-critical logs"},
				{name: "verboseServiceWorkerLogs", text: "set to 1 for verbose logs and 0 to silence non-critical logs"},
			] as const
			return `
            <div>🐸 Frogger, your neighborhood-friendly logger.</div><br/>

            <div>Options:</div>
            ${options.reduce(
		(total, next) => total + `-<span style="color: green; margin: 0.5rem;">${next.name}:</span> ${next.text}<br/>`,
		""
	)}
            `.trim()
		}
	})

	return [list, exit, frogger] as const
}

type ListenerRecord<
    Listener extends Function // eslint-disable-line
> = {callback: Listener, id: number}

export class EventListenerRecord<
    Listener extends Function // eslint-disable-line
> {
	private listenerRecords: ListenerRecord<Listener>[] = []
	private idCounter = 0

	private createNewId(): number {
		return this.idCounter++
	}

	getAll(): ReadonlyArray<Listener> {
		return this.listenerRecords.map(
			(record) => record.callback
		)
	}

	addEventListener(listener: Listener): number {
		const id = this.createNewId()
		const record = {id, callback: listener}
		this.listenerRecords.push(record)
		return id
	}

	removeEventListener(id: number): boolean {
		if (this.listenerRecords.length < 1) {
			return false
		}
		const index = this.listenerRecords.findIndex(
			(record) => record.id === id
		)
		if (index < 0) {
			return false
		}
		this.listenerRecords.splice(index, 1)
		return true
	}
}