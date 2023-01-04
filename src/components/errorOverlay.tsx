import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faTriangleExclamation} from "@fortawesome/free-solid-svg-icons"
import type {ReactNode} from "react"

type ErrorOverlayProps = {
    children: ReactNode
}

export const ErrorOverlay = ({children}: ErrorOverlayProps) => {
    return <div
        className="fixed z-50 w-screen h-screen top-0 left-0 flex items-center justify-center"
    >
        <div className="text-center">
            <div className="text-6xl text-yellow-500 mb-2">
                <FontAwesomeIcon icon={faTriangleExclamation}/>
            </div>
            <div className="text-lg">
                {children}
            </div>
        </div>
    </div>
}