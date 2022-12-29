import {useEffect, DependencyList} from "react"

export const useEffectAsync = (fn: () => Promise<any>, deps?: DependencyList) => {
    useEffect(() => { fn() }, deps)
}

export const useDebounce = (milliseconds: number) => {
    let timerId = -1
    return (fn: Function) => {
        clearTimeout(timerId)
        timerId = setTimeout(fn, milliseconds)
    }
}