import {Result} from "./base"

const unnamedError = "Error"

export const resultifyAsync = <P extends unknown[], R>(fn: (...args: P) => Promise<R>) => {
	return async (...args: P) => {
		try {
			return Result.ok(await fn(...args))
		} catch (err) {
			const e = err as Error
			return Result.err(`${e?.name || unnamedError} ${e?.message} ${e?.stack}`)
		}
	} 
}