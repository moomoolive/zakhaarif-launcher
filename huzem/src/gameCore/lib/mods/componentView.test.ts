import {
    compileComponentClass,
} from "./componentView"
import {expect, it, describe} from "vitest"
import {JsHeapRef, ComponentToken} from "zakhaarif-dev-tools"

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
            expect(compileComponentClass("", test as any, "", 0).ok).toBe(false)
        }
    })

    it("compiler should return not okay if definition is an array", () => {
        const tests = [
            [],
            [{field: "i32"}],
            [{field: "i32", field2: "f32"}],
        ] as const
        for (const test of tests) {
            expect(compileComponentClass("", test as any, "", 0).ok).toBe(false)
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
            expect(compileComponentClass("", test as any, "", 0).ok).toBe(false)
        }
    })

    it("compiler should return array of name-type pairs if definition is correct", () => {
        const tests = [
            {field: "i32"},
            {field: "f32", field2: "f32"},
            {field: "f32", field2: "f32", field3: "u32"},
        ] as const
        for (const def of tests) {
            const response = compileComponentClass("", def, "", 0)
            expect(response.ok).toBe(true)
            if (response.ok) {
                expect(response.componentClass.def).toStrictEqual(def)
            }
           
        }
    })
})

describe("class compiler", () => {
    const jsHeap: JsHeapRef = {
        i32: new Int32Array(4),
        f32: new Float32Array(4),
        u32: new Uint32Array(4)
    }
    it("accessors should be generated correctly", () => {
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
            const CompiledClass = compileResponse.componentClass
            expect(CompiledClass.name).toBe(name)
            expect(CompiledClass.fullname).toBe(fullname)
            expect(CompiledClass.id).toBe(targetId)
            expect(CompiledClass.def).toStrictEqual(tokens)
            const instance = new CompiledClass(3, jsHeap)
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
})