import {it, expect, describe} from "vitest"
import {faker} from "@faker-js/faker"
import { JsHeapRef } from "zakhaarif-dev-tools"
import {
    nativeComponentFactory, 
    orderKeys,
    NativeDescriptor
} from "./nativeComponent"


const randomComponents = (min = 4, max = 10) => {
    const test = []
    const len = faker.datatype.number({min, max})
    for (let i = 0; i < len; i++) {
        let comp: NativeDescriptor
        {
            const id = i
            const type = Math.random() > 0.5 ? "f32" : "i32"
            type Def = Record<string, "f32"> | Record<string, "i32">
            const def: Def  = {}
            const len = faker.datatype.number({min: 1, max: 9})
            for (let i = 0; i < len; i++) {
                def[`_${faker.word.noun()}`] = type
            }
            comp = {
                name: `randomPkg_${faker.word.noun()}`,
                def,
                id
            }
        }
        test.push(comp)
    }
    return test
}

const i32buf = new Int32Array(300)
const heap: JsHeapRef = {
    i32: i32buf,
    u32: new Uint32Array(i32buf.buffer),
    f32: new Float32Array(i32buf.buffer),
    f64: new Float64Array(i32buf.buffer),
    v: new DataView(i32buf.buffer)
}

describe("generating class object code", () => {
    it("generated LayoutMap class instances should have every property of passed in components", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
        const instance = context.layoutMap.new()
        expect(instance.layoutId$).toBeTypeOf("number")
        expect(instance.size$).toBeTypeOf("number")
        const fields = comps.map(
            ({def}) => Object.keys(def)
        )
        for (const field of fields.flat()) {
            expect(instance[field]).toBeTypeOf("number")
        }
    })

    it("generated view class instances should have every property of passed in components", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
        const fields = comps.map(
            ({def}) => Object.keys(def)
        ).flat()

        for (const V of context.views) {
            const instance = new V()
            for (const field of fields) {
                type K = keyof typeof instance
                expect(instance[field as K]).toBeTypeOf("number")
            }
        }
    })

    it("using to toLayout$ method with a valid class should return a layoutmap with an id other than 0", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)

        for (const V of context.views) {
            const instance = new V()
            for (const c of comps) {
                const self = instance.toLayout$(c.id)
                expect(self.layoutId$()).toBeTypeOf("number")
                expect(self.layoutId$()).not.toBe(0)
            }
        }
    })

    it("inputting a incorrect class id into 'toLayout$' set class layout to 0", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
        const nonExistent = 10_000
        const nonExistentComp = comps.find(
            ({id}) => id === nonExistent
        )
        expect(nonExistentComp).toBe(undefined)
        for (const V of context.views) {
            const instance = new V()
            const self = instance.toLayout$(nonExistent)
            expect(self.layoutId$()).toBe(0)
        }
    })

    it("generated component should have correct size (in blocks of 4 bytes)", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
    
        for (const V of context.views) {
            const v = new V()
            for (const c of comps) {
                const BYTES_PER_32BITS = 4
                expect(v.toLayout$(c.id).sizeof$()).toBe(
                    Object.keys(c.def).length * BYTES_PER_32BITS 
                )
            }
        }
    })

    it("to object method should return a js object repersentation of component", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
        
        for (const V of context.views) {
            const v = new V()
            for (const c of comps) {
                const obj = v.toLayout$(c.id).toObject()
                const keys = Object.keys(c.def)
                expect(Object.keys(obj)).length(keys.length)
                for (const key of keys) {
                    type K = keyof typeof obj
                    expect(obj[key as K]).toBeTypeOf("number")
                }
            }
        }
    })
})

describe("pointer view array-of-struct layouts", () => {
    it("generated component view should mutate underlying buffer correctly", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
        const views = [
            context.PointerViewI32,
            context.PointerViewF32,
        ]
        for (const V of views) {
            const v = new V()
            for (const m of comps) {
                const comp = v.toLayout$(m.id)
                const keys = orderKeys(m.def)
                const testindexes = 10
                for (let i = 0; i < testindexes; i++) {
                    const inc = i * 10
                    const mut = comp.index(i)
                    for (let k = 0; k < keys.length; k++) {
                        const key = keys[k]
                        const val = inc + k
                        {(mut as unknown as Record<string, number>)[key] = val}
                        expect(mut[key as keyof typeof mut]).toBe(val)
                    }
                }
                
                for (let i = 0; i < testindexes; i++) {
                    const inc = i * 10
                    const read = comp.index(i)
                    for (let k = 0; k < keys.length; k++) {
                        const key = keys[k]
                        const val = inc + k
                        expect(read[key as keyof typeof read]).toBe(val)
                    }
                }
            }
        }
    })
})

describe("pointer view array-of-struct layouts", () => {
    it("generated component view should mutate underlying buffer correctly", () => {
        const comps = randomComponents()
        const context = nativeComponentFactory(comps, heap)
        const views = [
            context.PointerViewSoaI32,
            context.PointerViewSoaF32
        ]
        for (const V of views) {
            const v = new V()
            for (const m of comps) {
                const comp = v.toLayout$(m.id)

                const fields = orderKeys(m.def)
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
                    const mut = comp.index(i)
                    for (let k = 0; k < fieldCount; k++) {
                        const key = fields[k]
                        const val = inc + k
                        {(mut as unknown as Record<string, number>)[key] = val}
                        expect(mut[key as keyof typeof mut]).toBe(val)
                    }
                }

                for (let i = 0; i < testfields; i++) {
                    const inc = i * 10
                    const read = comp.index(i)
                    for (let k = 0; k < fieldCount; k++) {
                        const key = fields[k]
                        const val = inc + k
                        type K = keyof typeof read
                        expect(read[key as K]).toBe(val)
                    }
                }
            }
        }
    })
})

describe("layout merging", () => {
    it("components that have the same fields should point to the same class layout", () => {
        const comps: NativeDescriptor[] = [
            {name: "c1", def: {x: "i32", y: "i32", z: "i32"}, id: 0},
            {name: "c2", def: {x: "i32", z: "i32", y: "i32"}, id: 1},
        ]
        const context = nativeComponentFactory(comps, heap)
        const instance1 = new context.PointerViewI32()
        const comp = instance1.toLayout$(context.componentLayoutRegistry.get(0) || 0)
        const instance2 = new context.PointerViewI32()
        const comp2 = instance2.toLayout$(context.componentLayoutRegistry.get(1) || 0)
        expect(comp.layoutId$()).toBe(comp2.layoutId$())
        expect(comp.l$).toBe(comp2.l$)
    })
})
