import {useState, useEffect} from "react"
import LoadingIcon from "@/components/loadingElements/loadingIcon"
import type {ReactNode} from "react"

type FullScreenLoadingOverlayProps = {
    loading: boolean
    children: ReactNode
    minimumLoadTimeMilliseconds?: number
}

export const FullScreenLoadingOverlay = ({
    loading,
    children,
    minimumLoadTimeMilliseconds = -1
}: FullScreenLoadingOverlayProps) => {
    const [
        minimumLoadTimeFinished, 
        setMinimumLoadTimeFinished
    ] = useState(minimumLoadTimeMilliseconds < 0)

    useEffect(() => {
        if (minimumLoadTimeFinished) {
            return
        }
        const id = setTimeout(() => {
            setMinimumLoadTimeFinished(true)
        }, minimumLoadTimeMilliseconds)
        return () => clearTimeout(id)
    }, [])

    if (!loading && minimumLoadTimeFinished) {
        return <div>{children}</div>
    }
    return <div
        className="fixed z-50 w-screen h-screen top-0 left-0 flex items-center justify-center"
    >
        <div className="text-6xl text-blue-500 animate-spin">
            <LoadingIcon/>
        </div>
    </div>
}