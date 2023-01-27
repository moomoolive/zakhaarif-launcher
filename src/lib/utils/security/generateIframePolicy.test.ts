import {expect, describe, it} from "vitest"
import {generateIframePolicy, isCspHttpValueDangerous} from "./generateIframePolicy"
import { ALLOW_ALL_PERMISSIONS, permissionsMeta } from "../../types/permissions"

describe("filtering malicous csp values", () => {
    it("values that don't start with https or http should be rejected", () => {
        const cases = [
            "hi",
            "no-https",
            "c",
            "http.malicious.com",
            "https.notagoodpolicy.com"
        ] as const
        for (const c of cases) {
            expect(isCspHttpValueDangerous(c)).toBe(true)
        }
    })

    it("values that include single or double quotes should be rejected", () => {
        const cases = [
            "https://'unsafe-hashes'",
            encodeURIComponent("'unsafe-inline'"),
            '"none"'
        ] as const
        for (const c of cases) {
            expect(isCspHttpValueDangerous(c)).toBe(true)
        }
    })

    it("values that include an asterik (*) character should be rejected", () => {
        const cases = [
            ALLOW_ALL_PERMISSIONS,
            "https://*.example.com",
            'http://*.com'
        ] as const
        for (const c of cases) {
            expect(isCspHttpValueDangerous(c)).toBe(true)
        }
    })

    it("values that do not have a dot in string will be rejected", () => {
        const cases = [
            "https://example",
            "http://a-virus-site",
            'https://let-gooooo'
        ] as const
        for (const c of cases) {
            expect(isCspHttpValueDangerous(c)).toBe(true)
        }
    })
})

describe("policy generator", () => {
    it("if non-extendable permission is preset it's relavent field should be set to false", () => {
        const result = generateIframePolicy([
            {key: "camera", value: []},
            {key: "unlimitedStorage", value: []},
        ])
        expect(result.unlimitedStorage).toBe(true)
        expect(result.camera).toBe(true)
        for (const key of Object.keys(result)) {
            const k = key as keyof typeof result
            if (k === "unlimitedStorage" || k === "camera") {
                continue
            }
            if (permissionsMeta[k].extendable) {
                expect(result[k]).toStrictEqual([])
                continue
            }
            expect(result[k]).toBe(false)
        }
    })

    it("if extendable permission (webRequest, embedExtensions, etc.) have the '*' directive, all other values should be removed except the directive itself", () => {
        const result = generateIframePolicy([
            {key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS, "https://a-cargo-i-want-to-embed.com"]},
            {key: "webRequest", value: [ALLOW_ALL_PERMISSIONS, "https://mymamashouse.com"]},
        ])
        expect(result.webRequest).toStrictEqual([ALLOW_ALL_PERMISSIONS])
        expect(result.embedExtensions).toStrictEqual([ALLOW_ALL_PERMISSIONS])
        for (const key of Object.keys(result)) {
            const k = key as keyof typeof result
            if (permissionsMeta[k].extendable) {
                continue
            }
            expect(result[k]).toBe(false)
        }
    })

    it(`if '${ALLOW_ALL_PERMISSIONS}' (allow-all) permission is found all permissions should be set to true`, () => {
        const result = generateIframePolicy([
            {key: ALLOW_ALL_PERMISSIONS, value: []}
        ])
        for (const key of Object.keys(result)) {
            const k = key as keyof typeof result
            if (permissionsMeta[k].extendable) {
                expect(result.webRequest).toStrictEqual([ALLOW_ALL_PERMISSIONS])
            } else {
                expect(result[k]).toBe(true)
            }
        }
    })
})