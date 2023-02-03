import {it, describe, expect} from "vitest"
import {stripRelativePath} from "./stripRelativePath"

describe("striping relative url identifiers", () => {
    it("non-relative urls should not be transformed", () => {
        const testCases = [
            "https://yo-mamas-house.com",
            "https://yo-papas-house.com",
            "http://localhost:3000",
            "https://app.wijha.com/pkg",
            "data:svg+xml,adflajsdfaklsfdjalskdfjalsdfj",
            "blob:localhost:3000/"
        ]
        for (const testCase of testCases) {
            const stripped = stripRelativePath(testCase)
            expect(stripped).toBe(testCase)
        }
    })

    it("urls that start with a slash ('/'), should be stripped of it's slash", () => {
        const testCases = [
            "/pkg",
            "/index.js",
            "/dir/pic.png",
            "/lots/of/dirs/asset.svg",
        ]
        for (const testCase of testCases) {
            const stripped = stripRelativePath(testCase)
            expect(stripped).toBe(testCase.slice(1))
        }
    })

    it("urls that start with a relative identifier ('./', '../', etc.), url should be stripped of it's relative identifier", () => {
        const testCases = [
            {url: "./index.js", transform: "index.js"},
            {url: "../index.js", transform: "index.js"},
            {url: "../../index.js", transform: "index.js"},
            {url: "../../../index.js", transform: "index.js"},
            {url: "./path/to/file/index.html", transform: "path/to/file/index.html"},
            {url: ".././.././/index.js", transform: "index.js"},
            {url: "../../src/entry.mjs", transform: "src/entry.mjs"},
            {url: ".///////style/index.css", transform: "style/index.css"},
            {url: "/////assets/cool.png", transform: "assets/cool.png"},
            {url: "./assets/../cool.png", transform: "assets/../cool.png"},
            {url: "./assets/./cool.png", transform: "assets/./cool.png"},
        ]
        for (const {url, transform} of testCases) {
            const stripped = stripRelativePath(url)
            expect(stripped).toBe(transform)
        }
    })
})