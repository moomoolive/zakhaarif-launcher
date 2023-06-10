import {expect, it, describe} from "vitest"
import {
    ModLinkStatus,
    runBeforeLoopEvent,
    BeforeLoopInfo,
    MainEngine,
    runInitEvent,
    InitInfo,
    StateInfo,
    createStateSingletons
} from "./core"
import {initWasmCore, initEngine} from "../test-utils"
import { ModMetadata } from "zakhaarif-dev-tools"

const status = (): ModLinkStatus => ({ok: true, errors: []})
const modmeta = (id: number): ModMetadata => ({
    canonicalUrl: "https://random.com",
    resolvedUrl: "https://random.com",
    name: "example-mod",
    dependencies: [],
    id
})
const wasmcore = await initWasmCore()
const EXAMPLE_ERROR = new Error("EXAMPLE ERROR")

describe("before loop lifecycle event", () => {
    const errorMod: BeforeLoopInfo = {
        wrapper: {onBeforeLoop: () => { throw EXAMPLE_ERROR }},
        canonicalUrl: "https://random.com"
    } 
    const okMod: BeforeLoopInfo = {
        wrapper: {onBeforeLoop: () => {}},
        canonicalUrl: "http://ok.com"
    }

    it("returns invalid link status if one of event handlers throw exception", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [errorMod], 
            [okMod, errorMod], 
            [okMod, errorMod, okMod],
            [errorMod, okMod, errorMod]
        ]
        for (const test of tests) {
            const res = await runBeforeLoopEvent(
                status(), test, engine, 
            )
            expect(res.ok).toBe(false)
            expect(res.errors.length).toBeGreaterThan(0)
            const code = MainEngine.STATUS_CODES.before_loop_handler_failed 
            const targetError = res.errors.find(
                (err) => err.status === code 
            )
            expect(targetError?.status).toBe(code)
        }
    })

    it("returns ok link status if all event handlers finish successfully", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [okMod], [okMod, okMod], [okMod, okMod, okMod]
        ]
        for (const test of tests) {
            const res = await runBeforeLoopEvent(
                status(), test, engine, 
            )
            expect(res.ok).toBe(true)
            expect(res.errors).length(0)
        }
    })
})

describe("init lifecycle event", () => {
    const errorMod: InitInfo = {
        wrapper: {onInit: () => { throw EXAMPLE_ERROR }},
    } 
    const okMod: InitInfo = {
        wrapper: {onInit: () => {}},
    }
    const metas = [modmeta(0), modmeta(1), modmeta(2), modmeta(3)]
    const idOffset = 0
    it("returns invalid link status if one of event handlers throw exception", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [errorMod], 
            [okMod, errorMod], 
            [okMod, errorMod, okMod],
            [errorMod, okMod, errorMod]
        ]
        for (const test of tests) {
            const res = await runInitEvent(
                status(), test, engine, metas, idOffset, false
            )
            expect(res.ok).toBe(false)
            expect(res.errors.length).toBeGreaterThan(0)
            const code = MainEngine.STATUS_CODES.init_handler_failed 
            const targetError = res.errors.find(
                (err) => err.status === code 
            )
            expect(targetError?.status).toBe(code)
        }
    })

    it("returns ok link status if all event handlers finish successfully", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [okMod], [okMod, okMod], [okMod, okMod, okMod]
        ]
        for (const test of tests) {
            const res = await runInitEvent(
                status(), test, engine, metas, idOffset, false
            )
            expect(res.ok).toBe(true)
            expect(res.errors).length(0)
        }
    })
})

describe("state lifecycle event", () => {
    const errorMod: StateInfo = {
        wrapper: {
            data: {
                name: "mod-1",
                state: () => { throw EXAMPLE_ERROR }
            }
        },
    } 
    const stateReturn = {data: "hi"}
    const okMod: StateInfo = {
        wrapper: {
            data: {
                name: "mod-2",
                state: () => stateReturn
            }
        },
    }
    const metas = [modmeta(0), modmeta(1), modmeta(2), modmeta(3)]
    const idOffset = 0
    it("returns invalid link status if one of event handlers throw exception", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [errorMod], 
            [okMod, errorMod], 
            [okMod, errorMod, okMod],
            [errorMod, okMod, errorMod]
        ]
        for (const test of tests) {
            const res = await createStateSingletons(
                status(), test, engine, metas, idOffset, false
            )
            expect(res.status.ok).toBe(false)
            expect(res.status.errors.length).toBeGreaterThan(0)
            const code = MainEngine.STATUS_CODES.state_handler_failed 
            const targetError = res.status.errors.find(
                (err) => err.status === code 
            )
            expect(targetError?.status).toBe(code)
        }
    })

    it("returns ok link status if all event handlers finish successfully", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [okMod], [okMod, okMod], [okMod, okMod, okMod]
        ]
        for (const test of tests) {
            const res = await createStateSingletons(
                status(), test, engine, metas, idOffset, false
            )
            expect(res.status.ok).toBe(true)
            expect(res.status.errors).length(0)
        }
    })

    it("state singleton should be the object returned from the state handler if handler does not throw exception", async () => {
        const engine = initEngine(wasmcore)
        const tests = [
            [okMod], [okMod, okMod], [okMod, okMod, okMod]
        ]
        for (const test of tests) {
            const res = await createStateSingletons(
                status(), test, engine, metas, idOffset, false
            )
            expect(res.status.ok).toBe(true)
            expect(res.singletons.length).toBe(test.length)
            for (const single of res.singletons) {
                expect(single).toBe(stateReturn)
            }
        }
    })

    it("should return empty object if state handler fails", async () => {
        const engine = initEngine(wasmcore)
        const stateReturn = {hi: "hi"}
        const errorMod: StateInfo = {
            wrapper: {
                data: {
                    name: "mod2",
                    state: () => {
                        throw EXAMPLE_ERROR
                        return stateReturn
                    }
                }
            }
        }
        const test = [errorMod]
        const res = await createStateSingletons(
            status(), test, engine, metas, idOffset, false
        )
        expect(res.status.ok).toBe(false)
        expect(res.singletons.length).toBe(test.length)
        expect(res.singletons[0]).toStrictEqual({})
    })

    it("singleton index should correspond to mod index", async () => {
        const engine = initEngine(wasmcore)
        const mod1State = {state: "mod1"}
        const mod1: StateInfo = {
            wrapper: {
                data: {
                    name: "mod1",
                    state: () => mod1State
                }
            }
        }
        const mod2state = {state: "mod2"}
        const mod2 = {
            wrapper: {
                data: {
                    name: "mod2",
                    state: () => mod2state
                }
            }
        }
        const test = [mod1, mod2]
        const states = [mod1State, mod2state]
        const res = await createStateSingletons(
            status(), test, engine, metas, idOffset, false
        )
        expect(res.status.ok).toBe(true)
        expect(res.singletons.length).toBe(test.length)
        for (const [i, single] of res.singletons.entries()) {
            expect(single).toStrictEqual(states[i])
        }
    })
})
