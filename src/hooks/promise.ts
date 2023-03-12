import {useRef, useState} from "react"
import {useEffectAsync} from "./effectAsync"

type AsyncValue<T, loading extends boolean> = {
    loading: loading
    data: loading extends true ? null : T
}
type LoadedState<T> = AsyncValue<T, false>
type LoadingState = AsyncValue<null, true>
type AsyncState<T> = LoadedState<T> | LoadingState
type SetAsyncStateAction<T> = [AsyncState<T>, (promise: Promise<T>) => void]

export const useAsyncState = <T>(promise: Promise<T>): SetAsyncStateAction<T> => {    
	const [loading, setLoading] = useState(true)

	const promiseRef = useRef(promise)
	const {current: imperativeState} = useRef({
		value: null as T | null,
		setter(value: Promise<T>) {
			setLoading(true)
			promiseRef.current = value
		}
	})

	useEffectAsync(async () => {
		if (!loading) {
			return
		}
		imperativeState.value = await promiseRef.current
		setLoading(false)
	}, [loading])

	if (loading) {
		return [{loading, data: null}, imperativeState.setter]
	}

	return [
        {loading, data: imperativeState.value} as LoadedState<T>, 
        imperativeState.setter
	]
}