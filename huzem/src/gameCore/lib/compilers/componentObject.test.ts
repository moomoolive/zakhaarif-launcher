import {it, expect, describe} from "vitest"
import {
    generateComponentObjectTokens, 
    ComponentToken,
    generateComponentObjectCode$,
    layoutMapName,
    layoutMapProperties,
    layoutMapRegistryName,
    STANDARD_CLASS_COUNT,
    pointerViewI32Name,
    pointerViewF32Name
} from "./componentObject"
import {
    hydrateComponentObjectContext
} from "./hydrateContext"
import {faker} from "@faker-js/faker"
import { JsHeapRef } from "zakhaarif-dev-tools"

const randomComponent = (): ComponentToken => {
    const type = Math.random() > 0.5 ? "f32" : "i32"
    type Def = Record<string, "f32"> | Record<string, "i32">
    const definition: Def  = {}
    const len = faker.datatype.number({min: 1, max: 9})
    for (let i = 0; i < len; i++) {
        definition[faker.word.noun()] = type
    }
    return {
        name: `randomPkg_${faker.word.noun()}`,
        definition
    }
}

const randomSetOfComponents = (min = 1, max = 10) => {
    const test = []
    const len = faker.datatype.number({min, max})
    for (let c = 0; c < len; c++) {
        test.push(randomComponent())
    }
    return test
}

describe("generating component object tokens", () => {
    it("generated meta data matches the amount of definitions entered", () => {
        for (let i = 0; i < 10; i++) {
            const test = randomSetOfComponents()
            const response = generateComponentObjectTokens(test)
            expect(response.componentCount).toBe(test.length)
            expect(response.meta).length(test.length)
            for (const def of test) {
                const {definition} = def
                const keys = Object.keys(definition)
                for (const key of keys) {
                    expect(response.allFields).includes(key)
                }
            }
        }
    })

    it("all fields for all components entered should be present in field list", () => {
        for (let i = 0; i < 10; i++) {
            const test = randomSetOfComponents()
            const response = generateComponentObjectTokens(test)
            for (const def of test) {
                const {definition} = def
                const keys = Object.keys(definition)
                for (const key of keys) {
                    expect(response.allFields).includes(key)
                }
            }
        }
    })

    it("component field offset should be correspond to field name's alphabetical order (ascending)", () => {
        for (let i = 0; i < 10; i++) {
            const test = randomSetOfComponents()
            const response = generateComponentObjectTokens(test)
            for (const meta of response.meta) {
                const {layout} = meta
                const keys = Object.keys(layout)
                    .filter((key) => !layoutMapProperties.includes(key as typeof layoutMapProperties[number]))
                    .sort()
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i]
                    expect(layout[key]).toBe(i)
                }
            }
        }
    })

    it("duplicate field names should be filtered out of allFields", () => {
        const response = generateComponentObjectTokens([
            {name: "rand", definition: {x: "i32"}},
            {name: "rand2", definition: {x: "i32"}},
        ])
        const xOccurence = response.allFields.reduce(
            (total, next) => total + (next === "x" ? 1 : 0),
            0
        )
        expect(xOccurence).toBe(1)
    })
})

describe("generating class object code", () => {
    const i32buf = new Int32Array(50)
    const heap: JsHeapRef = {
        i32: i32buf,
        u32: new Uint32Array(i32buf.buffer),
        f32: new Float32Array(i32buf.buffer),
        f64: new Float64Array(i32buf.buffer),
        v: new DataView(i32buf.buffer)
    }
    it("all generated code should be valid javascript", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            expect(context).toBeTypeOf("object")
            expect(context[layoutMapName]).toBeTypeOf("function")
            expect(context[pointerViewI32Name]).toBeTypeOf("function")
            //expect(context[pointerViewF32Name]).toBeTypeOf("function")
            expect(Array.isArray(context[layoutMapRegistryName])).toBe(true)
            expect(context[layoutMapRegistryName].length).greaterThan(STANDARD_CLASS_COUNT)
        }
    })

    it("generated LayoutMap class instances should have all of the standard properties", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const instance = new context[layoutMapName]()
            for (const prop of layoutMapProperties) {
                expect(instance[prop]).toBeTypeOf("number")
            }
        }
    })

    it("generated LayoutMap a field numbered after the index of each unique field in tokens", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const instance = new context[layoutMapName]()
            for (let i = 0; i < tokens.allFields.length; i++) {
                // f${i} => corresponds to same element in "allFields"
                // array. For example if "x" is at element 1, it's
                // corresponding property would be name f1.
                const name = `f${i}` as const
                expect(instance[name]).toBeTypeOf("number")
            }
        }
    })

    it("generated pointer view should generate getter fields named after every component that returns the object itself", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const instance = new context.PointerViewI32()
            expect(instance).not.toBe(undefined)
            for (const token of tokens.meta) {
                const {name} = token
                const value = instance[name as keyof typeof instance]
                expect(value).toBe(instance)
            }
        }
    })

    it("generated pointer view should generate getter & setter fields for all unique fields", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const instance = new context.PointerViewI32()
            expect(instance).not.toBe(undefined)
            for (const fieldName of tokens.allFields) {
                const value = instance[fieldName as keyof typeof instance]
                expect(value).toBeTypeOf("number")
            }
        }
    })

    it("generated accessing component name should set class layout to corresponding token 'classId'", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const instance = new context.PointerViewI32()
            expect(instance).not.toBe(undefined)
            for (const meta of tokens.meta) {
                const {name, classId} = meta
                const value = instance[name as keyof typeof instance]
                expect(value).toBe(instance)
                expect(instance.l$.layoutId$).toBe(classId)
            }
        }
    })
})