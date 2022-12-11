export const resultifyAsync = <P extends unknown[], R>(fn: (...args: P) => Promise<R>) => {
    return async (...args: P) => {
        try {
            return Result.ok(await fn(...args))
        } catch (err) {
            const e = err as Error
            return Result.err(`${e?.name} ${e?.message} ${e?.stack}`)
        }
    } 
}

export const resultifySync = <A extends unknown[], R>(fn: (...args: A) => R) => {
    return (...args: A) => {
        try {
            return Result.ok(fn(...args))
        } catch (err) {
            const e = err as Error
            return Result.err(`${e?.name} ${e?.message} ${e?.stack}`)
        }
    }
}

export class Result<T, Status extends boolean = true> {
    static ok = <R>(data: R) => new Result(data, "", true)
    static err = (msg: string) => new Result(null, msg, false)

    static wrapPromise = resultifyAsync(<P>(p: Promise<P>) => p)
    static wrapAsync = resultifyAsync(async <P>(fn: () => Promise<P>) => fn())
    static wrap = resultifySync(<R>(fn: () => R) => fn())

    readonly msg: string
    readonly data: Status extends true ? T : null
    readonly ok: Status

    private constructor(
        data: Status extends true ? T : null, 
        msg: string, 
        ok: Status
    ) {
      this.msg = msg
      this.data = data
      this.ok = ok
    }

    clone() {
        return new Result(this.data, this.msg, this.ok)
    }
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
