import {
    BrowserRouter,
    useLocation,
    Routes,
    Route,
} from "react-router-dom"
import {AppLaunch} from "./AppLaunch"
import NotFound from "./NotFound"
import {Suspense, lazy, useState, useEffect} from "react"

const StartMenu = lazy(() => import("./StartMenu"))
const GameShell = lazy(() => import("./GameShell"))

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
            <Route path="/start" element={<Suspense><StartMenu/></Suspense>}/>
            <Route path="/game" element={<Suspense><GameShell/></Suspense>}/>
        </Routes>
    </div>
}

const AppShellRoot = ({id}: {id: string}) => {
    return <div id={id}>
        <BrowserRouter>
            <div id="viewing-page">
                <PageDisplay/>
            </div>
        </BrowserRouter>
    </div>
}

export default AppShellRoot