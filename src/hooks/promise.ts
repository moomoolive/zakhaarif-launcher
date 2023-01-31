import {useState, useRef} from "react"
import {useEffectAsync} from "./effectAsync"
import {io, ResultType} from "../lib/monads/result"

export const usePromise = <T>(promise: Promise<T>) => {
    const [promiseState, setPromiseState] = useState<
        ResultType<T>
    >(io.err("pending..."))
    const pending = useRef(true)

    useEffectAsync(async () => {
        if (!pending.current || promiseState.ok) {
            return
        }
        setPromiseState(await io.wrap(promise))
        pending.current = false
    }, [])

    return {
        loading: pending.current,
        data: promiseState
    }
}