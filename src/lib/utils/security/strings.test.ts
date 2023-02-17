import {describe, it, expect} from "vitest"
import {stringEqualConstantTimeCompare} from "./strings"

describe("constant time string comparer", () => {
    it("should return true if strings are equal", () => {
        const comparedTo = "hello-there-i-am-a-string"
        const isSame = stringEqualConstantTimeCompare(comparedTo, comparedTo)
        expect(isSame).toBe(true)
    })

    it("should return false if strings are not equal", () => {
        const comparedTo = "hello-there-i-am-a-stringy"
        const tests = [
            "",
            "not-equal",
            "hello-there-i-am-a-stringy2",
            "hello-there-i-am-a-stringy_starting-is-correct",
            "textbefore_hello-there-i-am-a-stringy_textafter",
            "adfaljskaslfdjasdf",
            "x90000",
            "ends-with-correct-string_hello-there-i-am-a-stringy",
            "hello"
        ] as const
        for (const test of tests) {
            const isSame = stringEqualConstantTimeCompare(test, comparedTo)
            expect(isSame).toBe(false)
        }
    })
})