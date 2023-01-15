import {resultifySync} from "./resultify/sync"
import {resultifyAsync} from "./resultify/async"
import {Result as BaseResult} from "./resultify/base"

export type ResultType<T> = BaseResult<T, true> | BaseResult<null, false>

export class Result {
    static ok = BaseResult.ok
    static err = BaseResult.err

    static wrapPromise = resultifyAsync(<P>(p: Promise<P>) => p)
    static wrapAsync = resultifyAsync(async <P>(fn: () => Promise<P>) => fn())
    static wrap = resultifySync(<R>(fn: () => R) => fn())
}

export const io = {
    ok: Result.ok,
    err: Result.err,
    wrap: Result.wrapPromise,
    retry: async <P>(p: () => Promise<P>, count: number) => {
        for (let i = 0; i < count - 1; i++) {
            const res = await Result.wrapAsync(p)
            if (res.ok) {
                return res
            }
        }
        return await Result.wrapAsync(p)
    }
} as const
