import {
    BrowserRouter,
    useLocation,
    Routes,
    Route,
} from "react-router-dom"
import AppLaunch from "./AppLaunch"
import NotFound from "./NotFound"
import {useState, useEffect} from "react"
import {
    lazyComponent, 
    LazyComponentOptions,
    LazyComponent
} from "@/components/Lazy"
import {isIframe} from "@/lib/utils/isIframe"
import type {TopLevelAppProps} from "@/lib/types/globalState"
import {AppShellContext} from "./store"

if (isIframe()) {
    new Error("app-shell cannot run inside an iframe")
}

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

const fadeOut = 2
const fadeIn = 1

// taken from https://dev.to/fazliddin04/react-router-v6-animated-transitions-diy-3e6l
const PageDisplay = () => {
    const location = useLocation()

    const [displayLocation, setDisplayLocation] = useState(location)
    const [
        transitionStage, 
        setTransitionStage
    ] = useState(fadeIn)

    useEffect(() => {
        if (location !== displayLocation) {
            setTransitionStage(fadeOut)
        }
      }, [location, displayLocation])

    return <div
        className={transitionStage === fadeIn ? "animate-fade-in" : "animate-fade-out"}
        onAnimationEnd={() => {
            if (transitionStage === fadeOut) {
                setTransitionStage(fadeIn)
                setDisplayLocation(location)
            }
        }}
    >
        <Routes location={displayLocation}>
            <Route path="*" element={<NotFound/>}/>
            <Route path="/" element={<AppLaunch/>}/>
            <Route path="/start" element={<StartMenu/>}/>
            <Route path="/extension" element={<ExtensionShell/>}/>
            <Route path="/extensions-list" element={<ExtensionList/>}/>
            <Route path="/add-ons" element={<Addons/>}/>
            <Route path="/settings" element={<Settings/>}/>
        </Routes>
    </div>
}

type AppShellProps = {
    id: string
    globalState: TopLevelAppProps
}

export const AppShellRoot = ({
    id,
    globalState
}: AppShellProps) => {
    return <div id={id}>
        <BrowserRouter>
            <div id="viewing-page">
                <AppShellContext.Provider 
                    value={globalState}
                >
                    <PageDisplay/>
                </AppShellContext.Provider>
            </div>
        </BrowserRouter>
    </div>
}