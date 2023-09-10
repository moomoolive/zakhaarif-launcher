import {
	BrowserRouter,
	useLocation,
	Routes,
	Route,
} from "react-router-dom"
import {useState, useEffect, useRef} from "react"
import {lazyComponent, LazyComponentOptions, LazyComponent} from "../components/Lazy"
import {AppStore} from "../lib/utils/initAppStore"
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
import {VERBOSE_LAUNCHER_LOGS} from "../lib/utils/localStorageKeys"

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
		const [commandsStandardLibrary, terminalLibrary] = await Promise.all([
			import("../lib/utils/terminalStandardLibrary"),
			import("../lib/terminalEngine/index")
		] as const)
		const {TerminalEngine} = terminalLibrary
		const engine = new TerminalEngine()
		setTerminalEngine(engine)
		const {createCommands} = commandsStandardLibrary 
        
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