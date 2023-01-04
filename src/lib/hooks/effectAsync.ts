import {useEffect, DependencyList} from "react"

export const useEffectAsync = (fn: () => Promise<any>, deps?: DependencyList) => {
    useEffect(() => { fn() }, deps)
}