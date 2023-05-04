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
import {faker} from "@faker-js/faker"

const randomComponent = (): ComponentToken => {
    const type = Math.random() > 0.5 ? "f32" : "i32"
    type Def = Record<string, "f32"> | Record<string, "i32">
    const definition: Def  = {}
    const len = faker.datatype.number({min: 1, max: 9})
    for (let i = 0; i < len; i++) {
        definition[faker.word.noun()] = type
    }
    return {
        name: faker.word.noun(),
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
                    const bytesPer32bits = 4
                    expect(layout[key]).toBe(i * bytesPer32bits)
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
    it("all generated code should be valid javascript", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            console.log(code)
            const createFn = () => {
                return Function(`return ${code.componentObjectContext}`)()()
            }
            expect(createFn).not.toThrow()
            const context = createFn()
            expect(context).toBeTypeOf("object")
            expect(context[layoutMapName]).toBeTypeOf("function")
            expect(context[pointerViewI32Name]).toBeTypeOf("function")
            expect(context[pointerViewF32Name]).toBeTypeOf("function")
            expect(Array.isArray(context[layoutMapRegistryName])).toBe(true)
            expect(context[layoutMapRegistryName].length).greaterThan(STANDARD_CLASS_COUNT)
        }
    })

    it("generated LayoutMap class instances should have all of the standard properties", () => {
        for (let i = 0; i < 1; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const createFn = () => {
                return Function(`return ${code.componentObjectContext}`)()()
            }
            const context = createFn()
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
            const createFn = () => {
                return Function(`return ${code.componentObjectContext}`)()()
            }
            const context = createFn()
            const instance = new context[layoutMapName]()
            for (let i = 0; i < tokens.allFields.length; i++) {
                // f${i} => corresponds to same element in "allFields"
                // array. For example if "x" is at element 1, it's
                // corresponding property would be name f1.
                const name = `f${i}`
                expect(instance[name]).toBeTypeOf("number")
            }
        }
    })
})