import {
    compileComponentClass,
    computeFieldId,
    MAX_COMPONENT_FIELDS
} from "./componentView"
import {expect, it, describe} from "vitest"
import {JsHeapRef} from "zakhaarif-dev-tools"

describe("component tokenizer", () => {
    it("compiler should return not okay if definition is not an object", () => {
        const tests = [
            "",
            0,
            null,
            true,
            false,
            undefined,
            Symbol()
        ] as const
        for (const test of tests) {
            const response = compileComponentClass("", test as any, "", 0)
            expect(response.ok).toBe(false)
            expect(response.componentClass).toBe(null)
        }
    })

    it("compiler should return not okay if definition is an array", () => {
        const tests = [
            [],
            [{field: "i32"}],
            [{field: "i32", field2: "f32"}],
        ] as const
        for (const test of tests) {
            const response = compileComponentClass("", test as any, "", 0)
            expect(response.ok).toBe(false)
            expect(response.componentClass).toBe(null)
        }
    })

    it("compiler should return not okay if definition has unrecognized data type", () => {
        const tests = [
            {field: null},
            {field: 0},
            {field: ""},
            {field: true},
            {field: "num7", field2: "yeah"},
        ] as const
        for (const test of tests) {
            const response = compileComponentClass("", test as any, "", 0)
            expect(response.ok).toBe(false)
            expect(response.componentClass).toBe(null)
        }
    })

    it("compiler should return not ok if field name ends with '$'", () => {
        const tests = [
            {field$: "i32"},
            {ptr$: "f32", field2: "f32"},
            {field: "f32", field2: "f32", x$: "u32"},
        ] as const
        for (const def of tests) {
            const response = compileComponentClass("", def, "", 0)
            expect(response.ok).toBe(false)
            expect(response.componentClass).toBe(null)
        }
    })

    it("compiler should return not ok if component definition has no fields", () => {
        const response = compileComponentClass("", {}, "", 0)
        expect(response.ok).toBe(false)
        expect(response.componentClass).toBe(null)
    })

    it(`compiler should return not ok if component definition more than ${MAX_COMPONENT_FIELDS} fields`, () => {
        const def = {
            f1: "f32",
            f2: "f32",
            f3: "f32",
            f4: "f32",
            f5: "f32",
            f6: "f32",
            f7: "f32",
            f8: "f32",
            f9: "f32",
        } as const
        expect(Object.keys(def).length).toBeGreaterThan(MAX_COMPONENT_FIELDS)
        const response = compileComponentClass("", def, "", 0)
        expect(response.ok).toBe(false)
        expect(response.componentClass).toBe(null)
    })
})

describe("class compiler", () => {
    const jsHeap: JsHeapRef = {
        i32: new Int32Array(4),
        f32: new Float32Array(4),
        u32: new Uint32Array(4),
        f64: new Float64Array(4),
        v: new DataView(new ArrayBuffer(4))
    }
    it("accessors should be generated correctly if correct definition is provided", () => {
        const tests = [
            {tokens: {f: "f32"}, name: "floaty"},
            {tokens: {i: "i32"}, name: "inty"},
            {tokens: {u: "u32"}, name: "uinty"},
        ] as const
        let id = 0
        for (const {tokens, name} of tests) {
            const targetId = id++
            const fullname = "fullname-" + targetId
            const compileResponse = compileComponentClass(name, tokens, fullname, targetId)
            expect(compileResponse.ok).toBe(true)
            if (!compileResponse.ok) {
                continue
            }
            const {componentClass} = compileResponse
            expect(componentClass.name).toBe(name)
            expect(componentClass.fullname).toBe(fullname)
            expect(componentClass.id).toBe(targetId)
            expect(componentClass.def).toStrictEqual(tokens)
            const instance = componentClass.new(3, jsHeap)
            const tokenArray = Object.keys(tokens).map(
                (key) => ({name: key, type: tokens[key as keyof typeof tokens]})
            )
            for (const {name, type} of tokenArray) {
                expect((instance as any)[name + "Ptr"]()).toBeTypeOf("number")
                expect(instance.index).toBeTypeOf("function")
                const element = instance.index(0)
                const inputValue = Math.fround(-1.1)
                element[name] = inputValue
                switch (type) {
                    case "f32":
                        expect(element[name]).toBe(inputValue)
                        break
                    case "i32":
                        expect(element[name]).toBe(inputValue >> 0)
                        break
                    case "u32":
                        expect(element[name]).toBe(inputValue >>> 0)
                        break
                    default:
                        break
                }
            }
        }
    })

    it("component class size should be calculated correctly", () => {
        const tests = [
            {x: "i32", y: "i32", z: "i32"},
            {x: "i32", y: "u32"},
            {x: "i32", y: "i32", z: "i32", w: "f32"},
        ] as const

        for (const test of tests) {
            const compileResponse = compileComponentClass("", test, "", 0)
            expect(compileResponse.ok).toBe(true)
            expect(compileResponse).not.toBe(null)
            if (!compileResponse.ok) {
                continue
            }
            let expectedSize = 0
            for (const [_, value]  of Object.entries(test)) {
                switch (value) {
                    case "u32":
                    case "i32":
                    case "f32":
                        expectedSize += 32
                        break
                }
            }
            const {componentClass} = compileResponse
            expect(componentClass.sizeof).toBe(expectedSize)
        }
    })

    it("component field meta should be generated correctly", () => {
        const tests = [
            {x: "i32", y: "i32", z: "i32"},
            {x: "i32", y: "u32"},
            {x: "i32", y: "i32", z: "i32", w: "f32"},
        ] as const

        for (let i = 0; i < tests.length; i++) {
            const test = tests[i]
            const compileResponse = compileComponentClass("", test, "", i)
            expect(compileResponse.ok).toBe(true)
            expect(compileResponse).not.toBe(null)
            if (!compileResponse.ok) {
                continue
            }
            const {componentClass} = compileResponse
            const fields = [...Object.entries(test)]
            for (let x = 0; x < fields.length; x++) {
                const [key] = fields[x]
                const offset = componentClass.fields.findIndex(
                    ({name}) => name === key
                )
                expect(offset).toBeGreaterThan(-1)
                const field = componentClass.fields[offset]
                expect(field.id).toBe(computeFieldId(i, offset))
                expect(field.name).toBe(key)
                expect(field.offset).toBe(offset)
            }
        }
    })
})