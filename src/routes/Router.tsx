import {
    BrowserRouter,
    useLocation,
    Routes,
    Route,
} from "react-router-dom"
import {useState, useEffect, useRef} from "react"
import {
    lazyComponent, 
    LazyComponentOptions,
    LazyComponent
} from "@/components/Lazy"
import type {TopLevelAppProps} from "@/lib/types/globalState"
import {AppShellContext} from "./store"
import Launcher from "./Launcher"
import AppLaunch from "./AppLaunch"
import NotFound from "./NotFound"

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

const fadeOut = 2
const fadeIn = 1

// taken from https://dev.to/fazliddin04/react-router-v6-animated-transitions-diy-3e6l
const PageDisplay = () => {
    const location = useLocation()

    const [displayLocation, setDisplayLocation] = useState(location)
    const [transitionStage, setTransitionStage] = useState(fadeIn)

    const sandboxRef = useRef<null | HTMLIFrameElement>(null)
    const sandboxListenerRef = useRef<(event: MessageEvent) => any>(
        () => {}
    )
    const sandboxInitialized = useRef(false)

    useEffect(() => {
        if (
            sandboxInitialized.current
            || location.pathname === "/"
            || location.pathname.includes("/extension")
        ) {
            return
        }
        console.log("sandbox worker run...")
        const milliseconds = 500
        const timerId = window.setTimeout(() => {
            const sandboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
            const sandbox = document.createElement("iframe")
            console.info("Registering sandbox worker...")
            sandbox.setAttribute("sandbox", "allow-scripts allow-same-origin")
            const handler = (event: MessageEvent) => {
                const {data} = event
                if (typeof data !== "string" || data !== "finished") {
                    console.warn("iframe message is incorrectly encoded")
                    return
                }
                console.info("Sandbox worker registered! Removing iframe!")
                window.removeEventListener("message", sandboxListenerRef.current)
                sandboxRef.current = null
                document.body.removeChild(sandbox)
            }
            sandboxListenerRef.current = handler
            window.addEventListener("message", handler)
            sandbox.allow = ""
            sandbox.src = sandboxOrigin + "/"
            sandboxRef.current = sandbox
            sandbox.width = "0px"
            sandbox.height = "0px"
            document.body.appendChild(sandbox)
        }, milliseconds)
        sandboxInitialized.current = true
        return () => window.clearTimeout(timerId)
    }, [location])

    useEffect(() => {
        if (location !== displayLocation) {
            setTransitionStage(fadeOut)
        }
      }, [location, displayLocation])

    return <div
        className={transitionStage === fadeIn ? "animate-fade-in-left" : "animate-fade-out-left"}
        onAnimationEnd={() => {
            if (transitionStage === fadeOut) {
                setTransitionStage(fadeIn)
                setDisplayLocation(location)
            }
        }}
    >
        <Routes location={displayLocation}>
            <Route path="*" element={<NotFound/>}/>
            <Route path="/" element={<Launcher/>}/>
            <Route path="/launch" element={<AppLaunch/>}/>
            
            {/* lazy-loaded */}
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

type AppShellProps = {
    globalState: TopLevelAppProps
}

export const AppRouter = ({globalState}: AppShellProps) => {
    return <div>
        <BrowserRouter>
            <div id="viewing-page">
                <AppShellContext.Provider value={globalState}>
                    <PageDisplay/>
                </AppShellContext.Provider>
            </div>
        </BrowserRouter>
    </div>
}