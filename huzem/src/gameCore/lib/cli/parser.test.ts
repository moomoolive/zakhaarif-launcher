import {describe, it, expect} from "vitest"
import {
    validateCommandInput as validate
} from "./parser"

describe("cli argument parser", () => {
    it("should return error message if input is not an object", () => {
        const def = {} as const
        const tests = [
            null, 1, true, false, 0, "hey", Symbol(), () => {}
        ] as const
        for (const test of tests) {
            expect(validate(def, test as {}, "e").length).toBeGreaterThan(0)
        }
    })

    it("return error message if required arguments are missing", () => {
        const tests = [
            {x: "number"},
            {x: "boolean"},
            {x: "string"},
            {y: "string", z: "number"},
        ] as const
        for (const test of tests) {
            expect(validate(test, {} as any, "ex").length).toBeGreaterThan(0)
        }
    })

    it("should return error message if argument is wrong type", () => {
        const tests = [
            {def: {x: "number"}, data: {x: true}},
            {def: {x: "number?", y: "string"}, data: {x: true, y: 0}},
            {def: {z: "boolean"}, data: {z: "hey"}}
        ] as const
        for (const {def, data} of tests) {
            expect(validate(def, data as any, "ex").length).toBeGreaterThan(0)
        }
    })

    it("should return empty string if input is valid", () => {
        const tests = [
            {def: {x: "boolean"}, data: {x: true}},
            {def: {x: "string"}, data: {x: "str"}},
            {def: {x: "string?"}, data: {}},
            {def: {x: "boolean?", z: "boolean"}, data: {z: true}},
            {def: {x: "number?", z: "boolean?"}, data: {}},
        ] as const
        for (const {def, data} of tests) {
            expect(validate(def, data as any, "e").length).toBe(0)
        }
    })
})