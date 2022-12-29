import {expect, describe, it} from "vitest"
import {Result, resultifySync, resultifyAsync} from "./result"

describe("sync error containment functions", () => {
    it("wrap should be able to catch synchronous errors", () => {
        const msg = "[my custom err msg]"
        const errFn = () => {throw new TypeError("[my custom err msg]")}
        expect(errFn).toThrow()
        const res = Result.wrap(errFn)
        expect(res.ok).toBe(false)
        expect(res.msg.includes(msg))
    })

    it("resultify sync should make function never throw exception", () => {
        const msg = "[my custom err msg]"
        const errFn = () => {throw new Error("[my custom err msg]")}
        expect(errFn).toThrow()
        const NoErrs = resultifySync(errFn)
        const res = NoErrs()
        expect(res.ok).toBe(false)
        expect(res.msg.includes(msg))
    })
})

describe("async error containment functions", () => {
    it("wrapAsync should be able to catch async errors", async () => {
        const msg = "[my custom err msg]"
        const errFn = async () => {
            throw new Error("[my custom err msg]")
        }
        const res = await Result.wrapAsync(errFn)
        expect(res.ok).toBe(false)
        expect(res.msg.includes(msg))
    })

    it("wrapPromise should be able to catch Promise Errors", async () => {
        const msg = "[my custom err msg]"
        const errP = new Promise(() => {
            throw new Error("[my custom err msg]")
        })
        const res = await Result.wrapPromise(errP)
        expect(res.ok).toBe(false)
        expect(res.msg.includes(msg))
    })

    it("resultify async should make async function never throw exception", async () => {
        const msg = "[my custom err msg]"
        const errFn = async () => {throw new Error("[my custom err msg]")}
        const NoErrs = resultifyAsync(errFn)
        const res = await NoErrs()
        expect(res.ok).toBe(false)
        expect(res.msg.includes(msg))
    })
})

import {io} from "./result"

describe("io result helper", () => {
    it("retry should never throw execption", async () => {
        const msg = "[my custom err msg]"
        const errFn = async () => {throw new Error("[my custom err msg]")}
        const res = await io.retry(errFn, 3)
        expect(res.ok).toBe(false)
        expect(res.msg.includes(msg))
    })

    it("retry should be called the number of times inputted if function keeps on failing", async () => {
        const msg = "[my custom err msg]"
        const createErr = () => {
            const state = {
                exec: 0
            }
            const fn = async () => {
                state.exec++
                throw new Error("[my custom err msg]")
            }
            return {state, fn}
        }
        {
            const called = 3
            const {fn, state} = createErr()
            const res = await io.retry(fn, called)
            expect(res.ok).toBe(false)
            expect(res.msg.includes(msg))
            expect(state.exec).toBe(called)
        }

        {
            const called = 7
            const {fn, state} = createErr()
            const res = await io.retry(fn, called)
            expect(res.ok).toBe(false)
            expect(res.msg.includes(msg))
            expect(state.exec).toBe(called)
        }
    })

    it("retry should only be called once if inputted retry count is 1 or less", async () => {
        const msg = "[my custom err msg]"
        const createErr = () => {
            const state = {
                exec: 0
            }
            const fn = async () => {
                state.exec++
                throw new Error("[my custom err msg]")
            }
            return {state, fn}
        }
        {
            const {fn, state} = createErr()
            const res = await io.retry(fn, 1)
            expect(res.ok).toBe(false)
            expect(res.msg.includes(msg))
            expect(state.exec).toBe(1)
        }
        {
            const {fn, state} = createErr()
            const res = await io.retry(fn, 0)
            expect(res.ok).toBe(false)
            expect(res.msg.includes(msg))
            expect(state.exec).toBe(1)
        }
        {
            const {fn, state} = createErr()
            const res = await io.retry(fn, -199)
            expect(res.ok).toBe(false)
            expect(res.msg.includes(msg))
            expect(state.exec).toBe(1)
        }
    })

    it("retry should return directly after successful io", async () => {
        const msg = "[my custom err msg]"
        const createErr = (endErr: number) => {
            const state = {
                exec: 0
            }
            const fn = async () => {
                state.exec++
                if (state.exec < endErr) {
                    throw new Error("[my custom err msg]")
                }
                return true
            }
            return {state, fn}
        }
        {
            const errCount = 2
            const {fn, state} = createErr(errCount)
            const res = await io.retry(fn, 10)
            expect(res.ok).toBe(true)
            expect(res.data).toBe(true)
            expect(state.exec).toBe(errCount)
        }
        {
            const errCount = 1
            const {fn, state} = createErr(errCount)
            const res = await io.retry(fn, 10)
            expect(res.ok).toBe(true)
            expect(res.data).toBe(true)
            expect(state.exec).toBe(errCount)
        }
        // just a normal function...
        {   
            const fn = async () => true
            const res = await io.retry(fn, 10)
            expect(res.ok).toBe(true)
            expect(res.data).toBe(true)
        }
    })
})