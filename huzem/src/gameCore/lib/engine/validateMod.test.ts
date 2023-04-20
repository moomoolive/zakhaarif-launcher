import {describe, it, expect} from "vitest"
import {validateMod} from "./validateMod"

describe("mod package type package", () => {
    it("response should not be okay if mod package is not an 'object' type", () => {
        const tests = [
            0,
            1,
            true,
            "hi",
            Symbol(),
            1n,
            0n,
        ] as const
        for (const test of tests) {
            const response = validateMod(test)
            expect(response.ok).toBe(false)
            expect(response.error.length).toBeGreaterThan(0)
        }
    })

    it("response should not be okay if mod package null", () => {
        const response = validateMod(null)
        expect(response.ok).toBe(false)
        expect(response.error.length).toBeGreaterThan(0)
    })
})


describe("mod data validation", () => {
    it("response should not be okay if data is not an object or is null", () => {
        const tests = [
            0, 1, true, "hi",
            Symbol(), 1n, 0n, null
        ] as const
        for (const test of tests) {
            const mod = {data: test}
            const response = validateMod(mod)
            expect(response.ok).toBe(false)
            expect(response.error.length).toBeGreaterThan(0)
        }
    })

    it("response should not be okay if required fields are not present", () => {
        const tests = [
            {}
        ]
        for (const test of tests) {
            const mod = {data: test}
            const response = validateMod(mod)
            expect(response.ok).toBe(false)
            expect(response.error.length).toBeGreaterThan(0)
        }
    })

    it("response should not be okay if dependency field is invalid type", () => {
        const tests = [
            null, 0, 1, true, false, 1n, 0n, Symbol(), null,
            [{}],
            [{name: "x", type: 0}],
            [{name: "x", type: "optional", version: null}]
        ] as const
        for (const test of tests) {
            const mod = {
                data: {
                    name: "hi",
                    dependencies: test
                }
            }
            const response = validateMod(mod)
            expect(response.ok).toBe(false)
            expect(response.error.length).toBeGreaterThan(0)
        }
    })

    it("response should be okay if all required fields are present", () => {
        const tests = [
            {name: "hi"}
        ] as const
        for (const test of tests) {
            const mod = {data: test}
            const response = validateMod(mod)
            expect(response.ok).toBe(true)
            expect(response.error.length).toBe(0)
        }
    })
})

describe("lifecycle event validation", () => {
    it("response should not be okay if any of mod lifecyle events are not functions", () => {
        const tests = [
            0, 1, true, "hi",
            Symbol(), 1n, 0n, null
        ] as const
        for (const test of tests) {
            const mod = {
                data: {name: "hi"},
                onInit: test,
                onBeforeGameLoop: test,
                onExit: test
            }
            const response = validateMod(mod)
            expect(response.ok).toBe(false)
            expect(response.error.length).toBeGreaterThan(0)
        }
    })

    it("response be okay if mod lifecyle events or undefined functions", () => {
        const fn = () => {}
        const tests = [
            {onInit: fn, onBeforeGameLoop: fn, onExit: fn},
            {onInit: fn, onExit: fn},
            {onBeforeGameLoop: fn, onExit: fn},
            {onInit: fn, onBeforeGameLoop: fn},
            {onInit: fn},
            {},
        ]
        for (const test of tests) {
            const mod = {
                data: {name: "hi"},
                onInit: test.onInit,
                onBeforeGameLoop: test.onBeforeGameLoop,
                onExit: test.onExit
            }
            const response = validateMod(mod)
            expect(response.ok).toBe(true)
            expect(response.error.length).toBe(0)
        }
    })
})