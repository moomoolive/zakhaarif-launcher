import {lazy, Suspense} from "react"

export const lazyRoute = (
    factory: () => Promise<{default: () => JSX.Element}>
) => {
    const Route = lazy(factory)
    return (() => {
        return <Suspense>
            <Route/>
        </Suspense>
    })()
}