import {
    BrowserRouter,
    useLocation,
    Routes,
    Route,
} from "react-router-dom"
import {AppLaunch} from "./AppLaunch"
import NotFound from "./NotFound"
import {useState, useEffect} from "react"
import {
    lazyComponent, 
    LazyComponentOptions,
    LazyComponent
} from "@/components/lazy"
import {isIframe} from "@/lib/checks"

if (isIframe()) {
    new Error("app-shell cannot run inside an iframe")
}

type LazyRoute<T> = () => Promise<{ default: LazyComponent<T> }>

export function lazyRoute<T>(
    loader: LazyRoute<T>,
    options: LazyComponentOptions = {}
) {
    return lazyComponent(
        async () => (await loader()).default, 
        options
    )
}

const StartMenu = lazyRoute(() => import("./StartMenu"))
const GameShell = lazyRoute(() => import("./GameShell"))
const Addons = lazyRoute(() => import("./Addons"))

const fadeOut = "animate-fade-out"
const fadeIn = "animate-fade-in"

// taken from https://dev.to/fazliddin04/react-router-v6-animated-transitions-diy-3e6l
const PageDisplay = () => {
    const location = useLocation()

    const [displayLocation, setDisplayLocation] = useState(location)
    const [transitionStage, setTransitionStage] = useState(fadeIn)

    useEffect(() => {
        if (location !== displayLocation) {
            setTransitionStage(fadeOut)
        }
      }, [location, displayLocation])

    return <div
        className={transitionStage}
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
            <Route path="/game" element={<GameShell/>}/>
            <Route path="/add-ons" element={<Addons/>}/>
        </Routes>
    </div>
}

export const AppShellRoot = ({id}: {id: string}) => {
    return <div id={id}>
        <BrowserRouter>
            <div id="viewing-page">
                <PageDisplay/>
            </div>
        </BrowserRouter>
    </div>
}