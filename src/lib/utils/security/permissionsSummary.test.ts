import {expect, describe, it} from "vitest"
import {ALLOW_ALL_ORIGINS_CSP, cleanPermissions, ContentSecurityPolicyConfig, createContentSecurityPolicy, CSP_CONSTANT_POLICY, GeneralPermissions, generatePermissionsSummary, iframeAllowlist, iframeSandbox, isDangerousCspOrigin, REQUIRED_DEFAULT_SRC_CSP, REQUIRED_SANDBOX_ATTRIBUTES, SAME_ORIGIN_CSP_KEYWORD, UNSAFE_BLOBS_CSP, UNSAFE_DATA_URLS_CSP, UNSAFE_EVAL_CSP, UNSAFE_INLINE_CSP} from "./permissionsSummary"
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

describe("permissions summary generator", () => {
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
            } else if (permissionsMeta[k].fixedOptions) {
                expect(Object.values(result[k]).every((value) => !value)).toBe(true)
            } else {
                expect(result[k]).toBe(false)
            }
        }
    })

    it("inputting 'read option' for file permission should result in files being true", () => {
        const result = generatePermissionsSummary([
            {key: "files", value: ["read"]}
        ])
        expect(result.files).toBe(true)
    })

    it("fixed option permissions should have fields found in values array set to true, if they exist in options, otherwise it should be set to false", () => {
        const fixedOptionValidator = (value: string[]) => {
            const key = "gameSaves" as const
            const result = generatePermissionsSummary([
                {key, value}
            ])
            const allKeys = new Map<string, boolean>([
                ...Object.keys(result[key])
                    .map((k) => [k, !!(result[key][k as keyof typeof result[typeof key]])] as const)
            ])
            const setKeys = new Map<string, boolean>([
               ...value.map((v) => [v, true] as const)
            ])
            for (const [k] of allKeys) {
                if (setKeys.has(k)) {
                    expect(allKeys.get(k)).toBe(true)
                } else {
                    expect(allKeys.get(k)).toBe(false)
                }
            }
        }
        fixedOptionValidator(["read", "write"])
        fixedOptionValidator(["read"])
        fixedOptionValidator([])
        const result = generatePermissionsSummary([
            {key: "gameSaves", value: ["read", "write"]}
        ])
        expect(result.gameSaves).toStrictEqual({read: true, write: true})
        for (const key of Object.keys(result)) {
            const k = key as keyof typeof result
            if (permissionsMeta[k].extendable) {
                continue
            } else if (permissionsMeta[k].fixedOptions) {
                if (k === "gameSaves") {
                    continue
                }
                expect(Object.values(result[k]).every((value) => !value)).toBe(true)
            } else {
                expect(result[k]).toBe(false)
            }
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
            } else if (permissionsMeta[k].fixedOptions) {
                expect(Object.values(result[k]).every((value) => !value)).toBe(true)
            } else {
                expect(result[k]).toBe(false)
            }
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
            } else if (permissionsMeta[k].fixedOptions) {
                expect(Object.values(result[k]).every((value) => value)).toBe(true)
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

    it(`all values other than read and write should be filtered out in 'gameSaves'`, () => {
        const cleaned = cleanPermissions([
            {key: "gameSaves", value: ["read", "write", "x-option", "y-option"]},
        ])
        expect(cleaned.length).toBe(1)
        expect(cleaned[0].value).toStrictEqual(["read", "write"])
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

    it(`extendable and fixed option permissions should be filtered out if there are no values`, () => {
        const cleaned = cleanPermissions([
            {key: "webRequest", value: []},
            {key: "embedExtensions", value: []},
            {key: "gameSaves", value: []},
            {key: "geoLocation", value: []}
        ])
        expect(cleaned.length).toBe(1)
    })
})

describe("creating csp values", () => {
    it("constant security value should always be present regardless of parameters", () => {
        const cases = [
            {permissions: [], config: {}},
            {permissions: [{key: "geoLocation", value: []}], config: {workerSource: ["none"]}},
            {permissions: [{key: "webRequest", value: ["https://mywebsite.com"]}], config: {iframeSource: ["none"]}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            expect(csp).includes(CSP_CONSTANT_POLICY)
        }
    })

    it("unsafe permissions should be appended to default src of csp", () => {
        const cases = [
            {permissions: [{key: "allowUnsafeEval", value: []}, {key: "allowInlineContent", value: []}], config: {}},
            {permissions: [{key: "allowBlobs", value: []}], config: {}},
            {permissions: [{key: "allowDataUrls", value: []}], config: {}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            for (const {key} of permissions) {
                switch (key) {
                    case "allowUnsafeEval":
                        expect(defaultSrc).includes(UNSAFE_EVAL_CSP)
                        break
                    case "allowInlineContent":
                        expect(defaultSrc).includes(UNSAFE_INLINE_CSP)
                        break
                    case "allowBlobs":
                        expect(defaultSrc).includes(UNSAFE_BLOBS_CSP)
                        break
                    case "allowDataUrls":
                        expect(defaultSrc).includes(UNSAFE_DATA_URLS_CSP)
                        break
                    default:
                        break
                }
            }
        }
    })

    it("if permission summary allows all permissions or webRequest permission allow http request to any origin, csp should allow request to anywhere (expect those that are constant)", () => {
        const cases = [
            {permissions: [{key: "allowAll", value: []},], config: {}},
            {permissions: [{key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]},], config: {}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            expect(defaultSrc).includes(ALLOW_ALL_ORIGINS_CSP)
        }
    })

    it("if permission summary allows all permissions or webRequest permission allow http request to any origin, csp should allow request to anywhere (expect those that are constant)", () => {
        const cases = [
            {permissions: [{key: "allowAll", value: []},], config: {}},
            {permissions: [{key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]},], config: {}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            expect(defaultSrc).includes(ALLOW_ALL_ORIGINS_CSP)
        }
    })

    it("if permission summary allows all permissions or webRequest permission allow http request to any origin, csp should allow request to anywhere (expect those that are constant)", () => {
        const cases = [
            {permissions: [{key: "allowAll", value: []},], config: {}},
            {permissions: [{key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]},], config: {}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            expect(defaultSrc).includes(ALLOW_ALL_ORIGINS_CSP)
        }
    })

    it("if csp allows requests to host origin but provides an empty as host origin, csp should disallow request to origin", () => {
        const cases = [
            {permissions: [{key: "geoLocation", value: []},], config: {allowRequestsToHostOrigin: true, hostOrigin: ""}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            const [defaultValue] = defaultSrc.split("default-src").filter((str) => str.length > 0)
            expect(defaultValue.trim()).toEqual(REQUIRED_DEFAULT_SRC_CSP)
        }
    })

    it("if csp allows requests to host origin but provides an empty as host origin, csp should disallow request to origin", () => {
        const hostOrigin = "https://hey.com"
        const cases = [
            {permissions: [{key: "geoLocation", value: []},], config: {allowRequestsToHostOrigin: true, hostOrigin}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            const [defaultValue] = defaultSrc.split("default-src").filter((str) => str.length > 0)
            expect(defaultValue.trim()).includes(REQUIRED_DEFAULT_SRC_CSP)
            expect(defaultValue.trim()).includes(hostOrigin)
        }
    })

    it("if config disallows requests to host origin, csp should disallow requests to host origin", () => {
        const hostOrigin = "https://hey.com"
        const cases = [
            {permissions: [{key: "geoLocation", value: []},], config: {allowRequestsToHostOrigin: false, hostOrigin}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            const [defaultValue] = defaultSrc.split("default-src").filter((str) => str.length > 0)
            expect(defaultValue.trim()).toEqual(REQUIRED_DEFAULT_SRC_CSP)
        }
    })

    it("if config provides a non-empty cargo origin, csp should allow requests to cargo origin", () => {
        const cargoOrigin = "https://hey.com"
        const cases = [
            {permissions: [{key: "geoLocation", value: []},], config: {cargoOrigin}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            const [defaultValue] = defaultSrc.split("default-src").filter((str) => str.length > 0)
            expect(defaultValue.trim()).includes(REQUIRED_DEFAULT_SRC_CSP)
            expect(defaultValue.trim()).includes(cargoOrigin)
        }
    })

    it("if config provides a empty cargo origin, csp should disallow requests to cargo origin", () => {
        const cargoOrigin = "https://hey.com"
        const cases = [
            {permissions: [{key: "geoLocation", value: []},], config: {cargoOrigin: ""}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            const [defaultValue] = defaultSrc.split("default-src").filter((str) => str.length > 0)
            expect(defaultValue.trim()).includes(REQUIRED_DEFAULT_SRC_CSP)
            expect(defaultValue.trim()).not.includes(cargoOrigin)
        }
    })

    it("if webrequest permissions provides multiple origins to send requests to, csp should allow requests to relavent origins", () => {
        const cases = [
            {permissions: [{key: "webRequest", value: ["https://google.com"]},], config: {}},
            {permissions: [{key: "webRequest", value: ["https://news.org", "https://fb.me/pkg"]},], config: {}},
            {permissions: [{key: "webRequest", value: ["https://aljazeera.net", "https://washington-post.com/cargo/1/"]},], config: {}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            const [defaultValue] = defaultSrc.split("default-src").filter((str) => str.length > 0)
            for (const url of permissions[0].value) {
                expect(defaultValue).includes(url)
            }
        }
    })

    it("irrelvant permissions should be ignored", () => {
        const cases = [
            {permissions: [{key: "geoLocation", value: []},], config: {}},
            {permissions: [{key: "pointerLock", value: []},], config: {}},
            {permissions: [{key: "camera", value: []}, {key: "fullScreen", value: []}], config: {}},
        ] as Array<{permissions: GeneralPermissions, config: ContentSecurityPolicyConfig}>
        const defaultPolicy = `default-src ${REQUIRED_DEFAULT_SRC_CSP}`
        for (const {permissions, config} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const csp = createContentSecurityPolicy(summary, config)
            const [defaultSrc] = csp.split(";")
            expect(defaultSrc.trim()).toBe(defaultPolicy)
        }
    })
})

describe("iframe allow attribute generator", () => {
    it("if no permissions allowed an empty string should be returned", () => {
        const summary = generatePermissionsSummary([])
        expect(iframeAllowlist(summary)).toBe("")
    })

    it("if valid permission is entered, allowlist should only allow permission only for same origin", () => {
        expect(iframeAllowlist(generatePermissionsSummary([{key: "geoLocation", value: []}]))).toEqual(`geolocation ${SAME_ORIGIN_CSP_KEYWORD};`)
        expect(iframeAllowlist(generatePermissionsSummary([{key: "camera", value: []}]))).toEqual(`camera ${SAME_ORIGIN_CSP_KEYWORD};`)
        expect(iframeAllowlist(generatePermissionsSummary([{key: "displayCapture", value: []}]))).toEqual(`display-capture ${SAME_ORIGIN_CSP_KEYWORD};`)
        expect(iframeAllowlist(generatePermissionsSummary([{key: "fullScreen", value: []}]))).toEqual(`fullscreen ${SAME_ORIGIN_CSP_KEYWORD};`)
        expect(iframeAllowlist(generatePermissionsSummary([{key: "microphone", value: []}]))).toEqual(`microphone ${SAME_ORIGIN_CSP_KEYWORD};`)
    })

    it("if valid permissions is entered, allowlist should only allow permissions only for same origin", () => {
        const cases = [
            {permissions: [{key: "geoLocation", value: []}], search: ["geolocation"]},
            {permissions: [{key: "geoLocation", value: []}, {key: "microphone", value: []},], search: ["geolocation", "microphone"]},
            {permissions: [{key: "fullScreen", value: []}, {key: "displayCapture", value: []},], search: ["fullscreen", "display-capture"]},
        ]
        for (const {permissions, search} of cases) {
            const summary = generatePermissionsSummary(permissions)
            const allowlist = iframeAllowlist(summary)
            const allowed = allowlist.split(";").filter((str) => str.length > 0)
            expect(allowed.length).toBe(search.length)
            for (let i = 0; i < permissions.length; i++) {
                expect(allowlist).includes(`${search[i]} ${SAME_ORIGIN_CSP_KEYWORD};`)
            }
        }
    })

    it("irrelevant permissions should be ignored", () => {
        const cases = [
            [{key: "webRequest", value: ["*"]}],
            [{key: "allowInlineContent", value: []}],
            [{key: "webRequest", value: ["*"]}, {key: "pointerLock", value: []}],
        ]
        for (const permissions of cases) {
            const summary = generatePermissionsSummary(permissions)
            const allowlist = iframeAllowlist(summary)
            expect(allowlist).toBe("")
        }
    })
})

describe("iframe sandbox attribute generator", () => {
    it("if no permissions inputted, should return string with only required attributes", () => {
        const summary = generatePermissionsSummary([])
        expect(iframeSandbox(summary)).toBe(REQUIRED_SANDBOX_ATTRIBUTES)
    })

    it("if pointer-lock permission supplied, attribute should allow pointer lock", () => {
        const summary = generatePermissionsSummary([
            {key: "pointerLock", value: []}
        ])
        const sandbox = iframeSandbox(summary) 
        expect(sandbox).includes(REQUIRED_SANDBOX_ATTRIBUTES)
        expect(sandbox).includes("allow-pointer-lock")
    })

    it("irrelevant permissions should be ignored", () => {
        const cases = [
            [{key: "webRequest", value: ["*"]}],
            [{key: "geoLocation", value: []}],
            [{key: "fullScreen", value: []}],
            [{key: "allowInlineContent", value: []}],
            [{key: "webRequest", value: ["*"]}],
            [{key: "webRequest", value: ["*"]}, {key: "camera", value: []}],
        ]
        for (const permissions of cases) {
            const summary = generatePermissionsSummary(permissions)
            const sandbox = iframeSandbox(summary)
            expect(sandbox).toBe(REQUIRED_SANDBOX_ATTRIBUTES)
        }
    })
})