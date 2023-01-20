import {useAppShellContext} from "./store"
import {useEffect, useRef} from "react"

const ToLauncherPage = () => {
    const {showLauncher} = useAppShellContext()
    const pushed = useRef(false)

    useEffect(() => {
        if (pushed.current) {
            return
        }
        showLauncher(true)
        pushed.current = true
        window.setTimeout(() => {
            history.pushState(null, "Back to Launcher", "/")
        }, 10)
        return 
    }, [])

    return <div/>
}

export default ToLauncherPage