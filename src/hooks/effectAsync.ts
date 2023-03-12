import {useEffect, DependencyList} from "react"

export const useEffectAsync = (fn: () => Promise<unknown>, deps?: DependencyList) => {
	useEffect(() => { fn() }, deps)
}