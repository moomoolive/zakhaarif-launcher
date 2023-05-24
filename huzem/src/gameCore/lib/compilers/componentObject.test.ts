import {it, expect, describe} from "vitest"
import {
    generateComponentObjectTokens, 
    ComponentRegisterMeta,
    generateComponentObjectCode$,
    layoutMapName,
    layoutMapProperties,
    layoutMapRegistryName,
    STANDARD_CLASS_COUNT,
    pointerViewProperties,
    componentObjectCodeExports
} from "./componentObject"
import {
    hydrateComponentObjectContext
} from "./hydrateContext"
import {faker} from "@faker-js/faker"
import { JsHeapRef } from "zakhaarif-dev-tools"

const randomComponent = (classId: number): ComponentRegisterMeta => {
    const type = Math.random() > 0.5 ? "f32" : "i32"
    type Def = Record<string, "f32"> | Record<string, "i32">
    const definition: Def  = {}
    const len = faker.datatype.number({min: 1, max: 9})
    for (let i = 0; i < len; i++) {
        definition[`_${faker.word.noun()}`] = type
    }
    return {
        name: `randomPkg_${faker.word.noun()}`,
        definition,
        classId
    }
}

const randomSetOfComponents = (min = 1, max = 10) => {
    const test = []
    const len = faker.datatype.number({min, max})
    for (let i = 0; i < len; i++) {
        test.push(randomComponent(i))
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
            {name: "rand", definition: {x: "i32"}, classId: 0},
            {name: "rand2", definition: {x: "i32"}, classId: 1},
        ])
        const xOccurence = response.allFields.reduce(
            (total, next) => total + (next === "x" ? 1 : 0),
            0
        )
        expect(xOccurence).toBe(1)
    })
})

const TEST_COUNT = 10

const i32buf = new Int32Array(300)
const heap: JsHeapRef = {
    i32: i32buf,
    u32: new Uint32Array(i32buf.buffer),
    f32: new Float32Array(i32buf.buffer),
    f64: new Float64Array(i32buf.buffer),
    v: new DataView(i32buf.buffer)
}

describe("generating class object code", () => {
    it("all generated code should be valid javascript", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            expect(context).toBeTypeOf("object")
            for (const prop of componentObjectCodeExports) {
                expect(context[prop]).not.toBe(undefined)
                if (prop.toLowerCase().includes("array")) {
                    expect(Array.isArray(context[prop])).toBe(true)
                } else {
                    expect(context[prop]).toBeTypeOf("function")
                }
            }
            expect(context[layoutMapRegistryName].length).greaterThan(STANDARD_CLASS_COUNT)
        }
    })

    it("generated LayoutMap class instances should have all of the standard properties", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
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
        for (let i = 0; i < TEST_COUNT; i++) {
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

    it("generated pointer view class should have all standard properties and methods", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const ptrview = new cls()
                for (const prop of pointerViewProperties) {
                    expect(ptrview[prop]).not.toBe(undefined)
                }
            }
        }
    })

    it("generated pointer view should generate getter fields named after every component that returns the object itself", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const token of tokens.meta) {
                    const {name} = token
                    const value = instance[name as keyof typeof instance]
                    expect(value).toBe(instance)
                }
            }
        }
    })

    it("generated pointer view should generate getter & setter fields for all unique fields", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const fieldName of tokens.allFields) {
                    const value = instance[fieldName as keyof typeof instance]
                    expect(value).toBeTypeOf("number")
                }
            }
        }
    })

    it("generated accessing component name should set class layout to corresponding token 'classId'", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const meta of tokens.meta) {
                    const {name, layoutId} = meta
                    const value = instance[name as keyof typeof instance]
                    expect(value).toBe(instance)
                    expect(instance.l$.layoutId$).toBe(layoutId)
                }
            }
        }
    })

    it("inputting a correct class id into 'toLayout$' method should set layout to relavent", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const meta of tokens.meta) {
                    const {layoutId, classId} = meta
                    const value = instance.toLayout$(classId)
                    expect(value).toBe(instance)
                    expect(instance.l$.layoutId$).toBe(layoutId)
                }
            }
        }
    })

    it("inputting a incorrect class id into 'toLayout$' method should throw exception", () => {
        const test = randomSetOfComponents()
        const tokens = generateComponentObjectTokens(test)
        const code = generateComponentObjectCode$(tokens)
        const context = hydrateComponentObjectContext(
            code.componentObjectContext, heap
        )
        const i = new context.PointerViewF32()
        expect(() => i.toLayout$(10_000)).toThrow()
    })

    it("generated component should have correct size (in blocks of 4 bytes)", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const meta of tokens.meta) {
                    const comp = instance[meta.name as keyof typeof instance]
                    expect(comp).toBe(instance)
                    const bytesPer32Bits = 4
                    expect(instance.sizeof$()).toBe(Object.keys(meta.layout).length * bytesPer32Bits)
                }
            }
        }
    })

    it("to object method should return a js object repersentation of component", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
                context.PointerViewSoaI32,
                context.PointerViewSoaF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const m of tokens.meta) {
                    const {name, layout} = m
                    const comp = instance[name as keyof typeof instance]
                    expect(comp).toBe(instance)
                    const obj = instance.toObject()
                    expect(obj).toBeTypeOf("object")
                    for (const fieldName of Object.keys(layout)) {
                        const value = obj[fieldName as keyof typeof obj]
                        expect(value).toBeTypeOf("number")
                    }
                }
            }
        }
    })
})

describe("pointer view array-of-struct layouts", () => {
    it("generated component index method should move pointer by index multiplied my sizeof", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const meta of tokens.meta) {
                    const comp = instance[meta.name as keyof typeof instance]
                    expect(comp).toBe(instance)
                    const {computedPtr$: outerptr} = instance.index(0)
                    expect(outerptr).toBe(0)
                    let prevPtr = outerptr
                    const sizeof = instance.sizeof$()
                    for (let i = 1; i < 5; i++) {
                        const c = instance.index(i)
                        const innerptr = instance.computedPtr$
                        expect(innerptr).toBe(prevPtr + sizeof)
                        prevPtr = innerptr
                    }
                }
            }
        }
    })

    it("generated component view should mutate underlying buffer correctly", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewI32,
                context.PointerViewF32,
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const m of tokens.meta) {
                    const {layout, name} = m
                    const c = instance[name as keyof typeof instance]
                    expect(c).toBe(instance)
                    const keys = Object.keys(layout)
                    const testindexes = 10
                    for (let i = 0; i < testindexes; i++) {
                        const inc = i * 10
                        const mut = instance.index(i)
                        for (let k = 0; k < keys.length; k++) {
                            const key = keys[k]
                            const val = inc + k
                            {(mut as unknown as Record<string, number>)[key] = val}
                            expect(mut[key as keyof typeof mut]).toBe(val)
                        }
                    }
                    // see if it was all mutated correct
                    for (let i = 0; i < testindexes; i++) {
                        const inc = i * 10
                        const read = instance.index(i)
                        for (let k = 0; k < keys.length; k++) {
                            const key = keys[k]
                            const val = inc + k
                            expect(read[key as keyof typeof read]).toBe(val)
                        }
                    }
                }
            }
        }
    })
})

describe("pointer view array-of-struct layouts", () => {
    it("generated component view should mutate underlying buffer correctly", () => {
        for (let i = 0; i < TEST_COUNT; i++) {
            const test = randomSetOfComponents()
            const tokens = generateComponentObjectTokens(test)
            const code = generateComponentObjectCode$(tokens)
            
            const context = hydrateComponentObjectContext(
                code.componentObjectContext, heap
            )
            const classes = [
                context.PointerViewSoaI32,
                context.PointerViewSoaF32
            ]
            for (const cls of classes) {
                const instance = new cls()
                expect(instance).not.toBe(undefined)
                for (const m of tokens.meta) {
                    const comp = instance[m.name as keyof typeof instance]
                    expect(comp).toBe(comp)
                    const fields = Object.keys(m.layout)
                    const fieldCount = fields.length
                    const datastart = fieldCount
                    const testfields = 10
                    let arrayoffset = datastart
                    for (let i = 0; i < datastart; i++) {
                        heap.u32[i] = arrayoffset
                        arrayoffset += testfields
                    }

                    for (let i = 0; i < testfields; i++) {
                        const inc = i * 10
                        const mut = instance.index(i)
                        for (let k = 0; k < fieldCount; k++) {
                            const key = fields[k]
                            const val = inc + k
                            {(mut as unknown as Record<string, number>)[key] = val}
                            expect(mut[key as keyof typeof mut]).toBe(val)
                        }
                    }

                    // see if it was all mutated correct
                    for (let i = 0; i < testfields; i++) {
                        const inc = i * 10
                        const read = instance.index(i)
                        for (let k = 0; k < fieldCount; k++) {
                            const key = fields[k]
                            const val = inc + k
                            expect(read[key as keyof typeof read]).toBe(val)
                        }
                    }
                }
            }
        }
    })
})

describe("layout merging", () => {
    it("components that have the same fields should point to the same class layout", () => {
        const test: ComponentRegisterMeta[] = [
            {name: "c1", definition: {x: "i32", y: "i32", z: "i32"}, classId: 0},
            {name: "c2", definition: {x: "i32", z: "i32", y: "i32"}, classId: 1},
        ]
        const tokens = generateComponentObjectTokens(test)
        const code = generateComponentObjectCode$(tokens)
        const context = hydrateComponentObjectContext(
            code.componentObjectContext, heap
        )
        const instance1 = new context.PointerViewSoaI32()
        const comp = instance1[test[0].name as keyof typeof instance1]
        expect(comp).toBe(instance1)
        const instance2 = new context.PointerViewI32()
        const comp2 = instance2[test[1].name as keyof typeof instance2]
        expect(comp2).toBe(instance2)
        expect(instance1.layoutId$()).toBe(instance2.layoutId$())
    })
})

describe("pointer view utilities", () => {
    it("clone ref creates a shallow copy of pointer view", () => {
        const tokens = generateComponentObjectTokens([
            {name: "c1", definition: {x: "i32", y: "i32", z: "i32"}, classId: 0},
        ])
        const code = generateComponentObjectCode$(tokens)
        const context = hydrateComponentObjectContext(
            code.componentObjectContext, heap
        )
        const ptr = new context.PointerViewSoaI32()
        ptr.mut()
        ptr.ref()
        const clone = ptr.cloneRef()
        // should point to same address, offset, and be of same
        // layout type
        expect(ptr.p$).toStrictEqual(clone.p$)
        expect(ptr.o$).toStrictEqual(clone.o$)
        expect(ptr.l$).toStrictEqual(clone.l$)
        expect(ptr).toStrictEqual(clone)
    })
})