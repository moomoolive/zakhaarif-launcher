import {useRef} from "react"

export const useDebounce = (milliseconds: number) => {
    const timerId = useRef(-1)
    return (fn: Function) => {
        clearTimeout(timerId.current)
        timerId.current = setTimeout(fn, milliseconds)
    }
}
