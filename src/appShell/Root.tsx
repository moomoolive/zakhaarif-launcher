import {RouterProvider, createBrowserRouter} from "react-router-dom"
import {AppLaunch} from "./AppLaunch"
import {Suspense, lazy} from "react"

const StartMenu = lazy(() => import("./StartMenu"))
const NotFound = lazy(() => import("./NotFound"))
const GameShell = lazy(() => import("./GameShell"))

const router = createBrowserRouter([
    {
        path: "/",
        element: <AppLaunch/>
    },
    {
        path: "/start",
        element: <Suspense>
            <StartMenu/>
        </Suspense>
    },
    {
        path: "/game",
        element: <Suspense>
            <GameShell/>
        </Suspense>
    }
])

export const Root = ({id}: {id: string}) => {
    return <div id={id}>
        <RouterProvider 
            router={router}
            fallbackElement={
                <Suspense>
                    <NotFound/>
                </Suspense>
            }
        />
    </div>
}

export default Root