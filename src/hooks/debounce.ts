import {useRef} from "react"

export const useDebounce = (milliseconds: number) => {
	const timerId = useRef(-1)
	return (fn: () => unknown) => {
		clearTimeout(timerId.current)
		timerId.current = window.setTimeout(fn, milliseconds)
	}
}
