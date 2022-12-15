import {RouterProvider, createBrowserRouter} from "react-router-dom"
import {AppLaunch} from "./views/AppLaunch"
import {Suspense, lazy} from "react"

const StartMenu = lazy(() => import("./views/StartMenu"))
const NotFound = lazy(() => import("./views/NotFound"))

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