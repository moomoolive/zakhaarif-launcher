import {
    BrowserRouter,
    useLocation,
    Routes,
    Route,
} from "react-router-dom"
import {useState, useEffect, useRef} from "react"
import {lazyComponent, LazyComponentOptions, LazyComponent} from "../components/Lazy"
import type {TopLevelAppProps} from "../lib/types/globalState"
import {AppShellContext, useAppShellContext} from "./store"
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

const PageDisplay = () => {
    const location = useLocation()
    const appContext = useAppShellContext()

    const [displayLocation, setDisplayLocation] = useState(location)
    const [transitionStage, setTransitionStage] = useState(fadeIn)

    const sandboxInitialized = useRef(false)

    useEffect(() => {
        if (
            sandboxInitialized.current
            || location.pathname === "/"
            || location.pathname.includes("/extension")
        ) {
            return
        }
        const initializePromise = {
            resolve: (_: boolean) => {},
            reject: (_?: unknown) => {},
            promise: Promise.resolve(true)
        }
        initializePromise.promise = new Promise<boolean>((resolve, reject) => {
            initializePromise.reject = reject
            initializePromise.resolve = resolve
        })
        appContext.sandboxInitializePromise = initializePromise
        // Allow the route two frames (16msx2) to build
        // the dom. Then inject intialization iframe.
        const milliseconds = 32
        window.setTimeout(() => {
            const sandbox = document.createElement("iframe")
            console.info("Registering sandbox worker...")
            const handler = (event: MessageEvent) => {
                const {data} = event
                if (typeof data !== "string" || data !== "finished") {
                    console.warn("iframe message is incorrectly encoded")
                    appContext.sandboxInitializePromise.resolve(false)
                    return
                }
                appContext.sandboxInitializePromise.resolve(true)
                console.info("Sandbox worker registered! Removing iframe!")
                window.removeEventListener("message", handler)
                document.body.removeChild(sandbox)
            }
            window.addEventListener("message", handler)
            sandbox.setAttribute("sandbox", "allow-scripts allow-same-origin")
            sandbox.allow = ""
            const sandboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
            sandbox.src = sandboxOrigin + "/"
            sandbox.width = "0px"
            sandbox.height = "0px"
            document.body.appendChild(sandbox)
        }, milliseconds)
        sandboxInitialized.current = true
    }, [location])

    useEffect(() => {
        if (location !== displayLocation) {
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
            <Route path="*" element={<NotFound/>}/>
            <Route path="/" element={<Launcher/>}/>
            <Route path="/launch" element={<AppLaunch/>}/>
            
            {
            // lazy loaded routes
            }
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
    return <BrowserRouter>
        <AppShellContext.Provider value={globalState}>
            <PageDisplay/>
        </AppShellContext.Provider>
    </BrowserRouter>
}