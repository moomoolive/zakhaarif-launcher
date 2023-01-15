import {Result} from "./base"

const unnamedError = "Error"

export const resultifySync = <A extends unknown[], R>(fn: (...args: A) => R) => {
    return (...args: A) => {
        try {
            return Result.ok(fn(...args))
        } catch (err) {
            const e = err as Error
            return Result.err(`${e?.name || unnamedError} ${e?.message} ${e?.stack}`)
        }
    }
}