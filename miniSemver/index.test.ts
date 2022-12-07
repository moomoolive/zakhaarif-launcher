import {describe, it, expect} from "vitest"
import {SemVer} from "./index"

describe("can correctly parse version from string", () => {
    it("returns null if major, minor, or patch not provided", () => {
        expect(SemVer.fromString("")).toBe(null)
        expect(SemVer.fromString("0")).toBe(null)
        expect(SemVer.fromString("0.0")).toBe(null)
        expect(SemVer.fromString("0.0.")).toBe(null)
        expect(SemVer.fromString("1..1")).toBe(null)
        expect(SemVer.fromString("1..")).toBe(null)
        expect(SemVer.fromString("..1")).toBe(null)
        expect(SemVer.fromString(".7.")).toBe(null)
        expect(SemVer.fromString("1.0.prealpha")).toBe(null)
        expect(SemVer.fromString("1..1-beta.1")).toBe(null)
    })

    it("returns null if major, minor, or patch are below 0", () => {
        expect(SemVer.fromString("-1.4.4")).toBe(null)
        expect(SemVer.fromString("1.-55.4")).toBe(null)
        expect(SemVer.fromString("2.3.-9")).toBe(null)
    })

    it("returns correct version with major, minor, and patch", () => {
        const def = SemVer.fromString
        type n = number
        const res = (major: n, minor: n, patch: n) => ({major, minor, patch})
        const cases = [
            {v: def("0.1.0"), result: res(0, 1, 0)},
            {v: def("2.5.6"), result: res(2, 5, 6)},
            {v: def("1.53.0"), result: res(1, 53, 0)},
            {v: def("13.2.7"), result: res(13, 2, 7)},
            {v: def("3.0.22"), result: res(3, 0, 22)},
        ]
        for (const {v, result} of cases) {
            expect(v).include(result)
        }
    })

    it("returns correct version with major, minor, and patch (with trailing dot)", () => {
        const def = SemVer.fromString
        type n = number
        const res = (major: n, minor: n, patch: n) => ({major, minor, patch})
        const cases = [
            {v: def("0.1.0."), result: res(0, 1, 0)},
            {v: def("2.5.6."), result: res(2, 5, 6)},
            {v: def("1.53.0."), result: res(1, 53, 0)},
            {v: def("13.2.7."), result: res(13, 2, 7)},
            {v: def("3.0.22."), result: res(3, 0, 22)},
        ]
        for (const {v, result} of cases) {
            expect(v).include(result)
        }
    })

    it("returns null if invalid prerelease tag provided", () => {
        const def = SemVer.fromString
        expect(def("1.0.1-rand")).toBe(null)
        expect(def("1.0.1-cool")).toBe(null)
    })

    it("returns null if build provided without prerelease tag", () => {
        const def = SemVer.fromString
        expect(def("1.0.1-.1")).toBe(null)
        expect(def("1.0.1-.4")).toBe(null)
        expect(def("1.0.1-.rc")).toBe(null)
    })

    it("returns correct build and tag if provided", () => {
        const def = SemVer.fromString
        type n = number
        const res = (prerelease: string, build: number) => ({
            major: 1, minor: 2, patch: 3,
            prerelease, build
        })
        const cases = [
            {v: def("1.2.3-beta"), result: res("beta", 0)},
            {v: def("1.2.3-beta.13"), result: res("beta", 13)},
            {v: def("1.2.3-rc.3"), result: res("rc", 3)},
            {v: def("1.2.3-prealpha.4"), result: res("prealpha", 4)},
            {v: def("1.2.3-alpha.1"), result: res("alpha", 1)},
        ]
        for (const {v, result} of cases) {
            expect(v).include(result)
        }
    })

    it("returns correct build and tag if provided (builds as prerelease tags)", () => {
        const def = SemVer.fromString
        const res = (prerelease: string, build: number) => ({
            major: 1, minor: 2, patch: 3,
            prerelease, build
        })
        const cases = [
            {v: def("1.2.3-beta.prealpha"), result: res("beta", 0)},
            {v: def("1.2.3-alpha.alpha"), result: res("alpha", 1)},
            {v: def("1.2.3-rc.beta"), result: res("rc", 2)},
            {v: def("1.2.3-prealpha.rc"), result: res("prealpha", 3)},
            {v: def("1.2.3-alpha.beta"), result: res("alpha", 2)},
        ]
        for (const {v, result} of cases) {
            expect(v).include(result)
        }
    })
})

describe("correctly compares versions", () => {
    it("major version takes precendent", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.0")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("1.1.0"), test: eq(true, false, false)},
            {v: ver("3.1.0"), test: eq(false, false, true)},
            {v: ver("2.1.0"), test: eq(false, true, false)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })

    it("minor version takes precendent after major", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.0")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("2.0.0"), test: eq(true, false, false)},
            {v: ver("1.17.0"), test: eq(true, false, false)},
            {v: ver("2.3.0"), test: eq(false, false, true)},
            {v: ver("3.0.0"), test: eq(false, false, true)},
            {v: ver("2.1.0"), test: eq(false, true, false)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })

    it("patch version takes precendent after major, minor", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.5")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("2.1.3"), test: eq(true, false, false)},
            {v: ver("1.0.35"), test: eq(true, false, false)},
            {v: ver("2.0.35"), test: eq(true, false, false)},
            {v: ver("2.1.17"), test: eq(false, false, true)},
            {v: ver("2.4.2"), test: eq(false, false, true)},
            {v: ver("10.1.2"), test: eq(false, false, true)},
            {v: ver("3.0.0"), test: eq(false, false, true)},
            {v: ver("2.1.5"), test: eq(false, true, false)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })

    it("prerelease is considered lower than version without prerelease tag", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.5")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("2.1.5-beta"), test: eq(true, false, false)},
            {v: ver("2.1.5-alpha"), test: eq(true, false, false)},
            {v: ver("2.1.5-rc"), test: eq(true, false, false)},
            {v: ver("2.1.5-prealpha"), test: eq(true, false, false)},
            {v: ver("2.1.5-prealpha.16"), test: eq(true, false, false)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })

    it("prerelease tag takes precendent after major, minor, patch", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.5-beta")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("2.1.5-prealpha"), test: eq(true, false, false)},
            {v: ver("2.1.5-alpha"), test: eq(true, false, false)},
            {v: ver("2.0.5-rc"), test: eq(true, false, false)},
            {v: ver("2.1.5-rc"), test: eq(false, false, true)},
            {v: ver("2.1.5-beta"), test: eq(false, true, false)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })

    it("prerelease tag without build is equal to build 0", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.5-beta")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("2.1.5-beta.0"), test: eq(false, true, false)},
            {v: ver("2.1.5-beta.1"), test: eq(false, false, true)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })

    it("build takes precendent after major, minor, patch, prerelease tag", () => {
        const ver = (str: string) => SemVer.fromString(str)!
        const base = ver("2.1.5-alpha.5")
        type b = boolean
        const eq = (lower: b, equal: b, greater: b) => ({lower, equal, greater})
        const cases = [
            {v: ver("2.1.5-prealpha.5"), test: eq(true, false, false)},
            {v: ver("2.1.5-alpha.1"), test: eq(true, false, false)},
            {v: ver("2.1.5-rc"), test: eq(false, false, true)},
            {v: ver("2.1.5-alpha.6"), test: eq(false, false, true)},
            {v: ver("2.1.5-rc.0"), test: eq(false, false, true)},
            {v: ver("2.1.5-alpha.5"), test: eq(false, true, false)},
        ]
        for (const {v, test} of cases) {
            expect(v.isLower(base)).toBe(test.lower)
            expect(v.isEqual(base)).toBe(test.equal)
            expect(v.isGreater(base)).toBe(test.greater)
        }
    })
})