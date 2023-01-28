import {expect, describe, it} from "vitest"
import {cleanPermissions, generatePermissionsSummary, isDangerousCspOrigin} from "./permissionsSummary"
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
            expect(isDangerousCspOrigin(c)).toBe(true)
        }
    })

    it("csp directives should be rejected", () => {
        const cases = [
            "'unsafe-hashes'",
            "'unsafe-inline'",
            "'none'",
            "'nonce-DhcnhD3khTMePgXwdayK9BsMqXjhguVV'",
            "'strict-dynamic'",
            "'sha256-jzgBGA4UWFFmpOBq0JpdsySukE1FrEN5bUpoK8Z29fY='",
        ] as const
        for (const c of cases) {
            expect(isDangerousCspOrigin(c)).toBe(true)
        }
    })

    it("values that include an asterik (*) character should be rejected", () => {
        const cases = [
            ALLOW_ALL_PERMISSIONS,
            "https://*.example.com",
            'http://*.com'
        ] as const
        for (const c of cases) {
            expect(isDangerousCspOrigin(c)).toBe(true)
        }
    })

    it("values that do not have a dot in string will be rejected", () => {
        const cases = [
            "https://example",
            "http://a-virus-site",
            'https://let-gooooo'
        ] as const
        for (const c of cases) {
            expect(isDangerousCspOrigin(c)).toBe(true)
        }
    })
})

describe("policy generator", () => {
    it("if non-extendable permission is preset it's relavent field should be set to false", () => {
        const result = generatePermissionsSummary([
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
        const result = generatePermissionsSummary([
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
        const result = generatePermissionsSummary([
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

describe("permission filterer", () => {
    it("unrecognized values should be filtered out", () => {
        const cleaned = cleanPermissions([
            {key: "random-key", value: []},
            {key: "random-key2", value: []},
            {key: "geoLocation", value: []},
        ])
        expect(cleaned.length).toBe(1)
        expect(cleaned[0].key).toBe("geoLocation")
    })

    it(`extendable permissions (webRequest, embedExtensions, etc.) should filter out all other values if "${ALLOW_ALL_PERMISSIONS}" value exists`, () => {
        const cleaned = cleanPermissions([
            {key: "webRequest", value: [ALLOW_ALL_PERMISSIONS, "https://hey.com", "https://nononon.org"]},
            {key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS, "https://mymamashome.com", "https://google.com"]},
        ])
        expect(cleaned.length).toBe(2)
        for (const {value} of cleaned) {
            expect(value).toStrictEqual([ALLOW_ALL_PERMISSIONS])
        }
    })

    it(`duplicate permission values should be filtered out`, () => {
        const cleaned = cleanPermissions([
            {key: "webRequest", value: ["https://hey.com", "https://hey.com", "https://nononon.org", "https://nononon.org"]},
            {key: "embedExtensions", value: ["https://mymamashome.com", "https://mymamashome.com", "https://google.com", "https://google.com"]},
        ])
        expect(cleaned.length).toBe(2)
        for (const {value} of cleaned) {
            expect(value.length).toBe(2)
        }
    })

    it("non-http (and https) url values for webRequest permission should be filtered out", () => {
        const validUrls = [
            "https://hey.com", 
            "https://nononon.org"
        ]
        const cleaned = cleanPermissions([{
            key: "webRequest", 
            value: [
                ...validUrls, 
                "https://dangerous-site.*", "blob:",
                "data:svg+xml:adfajklfdakslfdjalsdfjasdflkj"
            ]
        }])
        expect(cleaned.length).toBe(1)
        expect(cleaned[0].value).toStrictEqual(validUrls)
    })
})