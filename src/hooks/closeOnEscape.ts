import { useEffect } from "react"

export const useCloseOnEscape = (onClose: () => void) => {
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const {key} = event
            if (key.toLowerCase() === "escape") {
                onClose()
            }
        }
        window.addEventListener("keyup", handler)
        return () => window.removeEventListener("keyup", handler)
    }, [])
}