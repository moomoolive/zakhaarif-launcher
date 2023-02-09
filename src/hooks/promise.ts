import {useState} from "react"
import {useEffectAsync} from "./effectAsync"

type PromiseReturn<T> = {
    loading: boolean
    data: T | null
}

export const usePromise = <T>(promise: Promise<T>): PromiseReturn<T> => {
    const [promiseState, setPromiseState] = useState<T | null>(null)
    const [loading, setLoading] = useState(true)

    useEffectAsync(async () => {
        if (!loading) {
            return
        }
        setPromiseState(await promise)
        setLoading(false)
    }, [])

    return {loading, data: promiseState}
}