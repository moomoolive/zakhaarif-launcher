import {expect, describe, it} from "vitest"
import {
    ALLOW_ALL_ORIGINS_CSP, 
    cleanPermissions, 
    ContentSecurityPolicyConfig, 
    createContentSecurityPolicy, 
    CSP_CONSTANT_POLICY, 
    diffPermissions, 
    GeneralPermissions, 
    generatePermissionsSummary, 
    hasUnsafePermissions, 
    iframeAllowlist, 
    iframeSandbox, 
    isDangerousCspOrigin, 
    mergePermissionSummaries, 
    REQUIRED_DEFAULT_SRC_CSP, 
    REQUIRED_SANDBOX_ATTRIBUTES, 
    SAME_ORIGIN_CSP_KEYWORD, 
    UNSAFE_BLOBS_CSP, 
    UNSAFE_DATA_URLS_CSP, 
    UNSAFE_EVAL_CSP, 
    UNSAFE_INLINE_CSP
} from "./permissionsSummary"
import { ALLOW_ALL_PERMISSIONS, permissionsMeta } from "../../types/permissions"
import {CargoIndex, emptyCargoIndices} from "../../shabah/downloadClient"
import { NULL_FIELD } from "../../cargo/index"

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
    it("boolean flag permissions should be set to true if found in permissions input", () => {
        const cases = [
            [{key: "camera", value: []}, {key: "unlimitedStorage", value: []}],
            [{key: "microphone", value: []}, {key: "allowInlineContent", value: []}],
            [{key: "displayCapture", value: []}],
            [{key: "fullScreen", value: []}],
            [{key: "pointerLock", value: ["values", "value2"]}],
        ]
        for (const input of cases) {
            const targetKeys = input.map((i) => i.key)
            const result = generatePermissionsSummary(input)

            for (const key of targetKeys) {
                expect(result[key as keyof typeof result]).toBe(true)
            }

            for (const key of Object.keys(result)) {
                const k = key as keyof typeof result
                if (targetKeys.includes(k)) {
                    expect(permissionsMeta[k].booleanFlag).toBe(true)
                    continue
                }
                if (permissionsMeta[k].extendable) {
                    expect(result[k]).toStrictEqual([])
                } else if (permissionsMeta[k].fixedOptions) {
                    expect(Object.values(result[k]).every((value) => !value)).toBe(true)
                } else if (permissionsMeta[k].booleanFlag) {
                    expect(result[k]).toBe(false)
                }
            }
        }
    })

    it("fixed option permissions should set value string that maps to option to true if present", () => {
        const cases = [
            [{key: "files", value: ["read"]}],
            [{key: "gameSaves", value: ["read", "write"]}],
            [{key: "gameSaves", value: ["read"]}, {key: "files", value: ["read"]}],
        ]
        for (const input of cases) {
            const targetKeys = input.map((i) => i.key)
            const result = generatePermissionsSummary(input)

            for (const {key, value} of input) {
                for (const option of value) {
                    const target = result[key as keyof typeof result]
                    expect(target[option as keyof typeof target]).toBe(true)
                }
            }

            for (const key of Object.keys(result)) {
                const k = key as keyof typeof result
                if (targetKeys.includes(k)) {
                    expect(permissionsMeta[k].fixedOptions).toBe(true)
                    continue
                }
                if (permissionsMeta[k].extendable) {
                    expect(result[k]).toStrictEqual([])
                } else if (permissionsMeta[k].fixedOptions) {
                    expect(Object.values(result[k]).every((value) => !value)).toBe(true)
                } else if (permissionsMeta[k].booleanFlag) {
                    expect(result[k]).toBe(false)
                }
            }
        }
    })

    it(`extendable permissions should return an array with input values or an array with only "${ALLOW_ALL_PERMISSIONS}", if value is found`, () => {
        const cases = [
            [{key: "webRequest", value: [ALLOW_ALL_PERMISSIONS, "https://mymamashouse.com"]}],
            [{key: "webRequest", value: ["https://mymamashouse.com", "https://myaunties-home.org"]}],
            [{key: "webRequest", value: ["https://mymamashouse.com", "https://myaunties-home.org"]}, {key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS, "https://another-website.com"]}],
        ]
        for (const input of cases) {
            const targetKeys = input.map((i) => i.key)
            const result = generatePermissionsSummary(input)

            for (const {key, value} of input) {
                const target = result[key as keyof typeof result]
                if (value.includes(ALLOW_ALL_PERMISSIONS)) {
                    expect(target).toStrictEqual([ALLOW_ALL_PERMISSIONS])
                } else {
                    expect(target).toStrictEqual(value)
                }
            }

            for (const key of Object.keys(result)) {
                const k = key as keyof typeof result
                if (targetKeys.includes(k)) {
                    expect(permissionsMeta[k].extendable).toBe(true)
                    continue
                }
                if (permissionsMeta[k].extendable) {
                    expect(result[k]).toStrictEqual([])
                } else if (permissionsMeta[k].fixedOptions) {
                    expect(Object.values(result[k]).every((value) => !value)).toBe(true)
                } else if (permissionsMeta[k].booleanFlag) {
                    expect(result[k]).toBe(false)
                }
            }
        }
    })

    it(`if '${ALLOW_ALL_PERMISSIONS}' boolean permission is set all permissions should be set to true`, () => {
        const result = generatePermissionsSummary([
            {key: ALLOW_ALL_PERMISSIONS, value: []}
        ])
        for (const key of Object.keys(result)) {
            const k = key as keyof typeof result
            if (permissionsMeta[k].extendable) {
                expect(result.webRequest).toStrictEqual([ALLOW_ALL_PERMISSIONS])
            } else if (permissionsMeta[k].fixedOptions) {
                expect(Object.values(result[k]).every((value) => value)).toBe(true)
            } else if (permissionsMeta[k].booleanFlag) {
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

    it(`all values for boolean flags should be filtered out`, () => {
        const cases = [
            {permissions: [{key: "camera", value: ["read", "write", "x-option", "y-option"]},]},
            {permissions: [{key: "geoLocation", value: ["read", "write", "x-option", "y-option"]},]},
            {permissions: [{key: "pointerLock", value: ["read", "write", "x-option", "y-option"]},]},
        ]
        for (const {permissions} of cases) {
            const cleaned = cleanPermissions(permissions)
            expect(cleaned.length).toBe(1)
            const {value, key} = cleaned[0]
            const target = permissionsMeta[key as keyof typeof permissionsMeta]
            expect(target.booleanFlag).toBe(true)
            expect(value).toStrictEqual([])
        }
    })

    it(`all values that do not exist on fixed option permission should be filtered`, () => {
        const cases = [
            {permissions: [{key: "gameSaves", value: ["read", "write", "x-option", "y-option"]},], result: ["read", "write"]},
            {permissions: [{key: "files", value: ["read", "write", "x-option", "y-option"]},], result: ["read"]},
        ]
        for (const {permissions, result} of cases) {
            const cleaned = cleanPermissions(permissions)
            expect(cleaned.length).toBe(1)
            const {value, key} = cleaned[0]
            const target = permissionsMeta[key as keyof typeof permissionsMeta]
            expect(target.fixedOptions).toBe(true)
            for (const v of value) {
                expect(result).includes(v)
            }
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

    it(`extendable and fixed option permissions should be filtered out if there are no values`, () => {
        const cleaned = cleanPermissions([
            {key: "webRequest", value: []},
            {key: "embedExtensions", value: []},
            {key: "gameSaves", value: []},
            {key: "geoLocation", value: []}
        ])
        expect(cleaned.length).toBe(1)
    })

    it(`if "${ALLOW_ALL_PERMISSIONS}" permission is found in permissions, all other permisssion should be filtered out`, () => {
        const cases = [
            [
                {key: "webRequest", value: ["https://my-cat.com"]},
                {key: "geoLocation", value: []},
                {key: "camera", value: []},
                {key: "camera", value: []},
            ],
            [
                {key: "fullScreen", value: []}
            ],
            [
                {key: "pointerLock", value: []},
                {key: "displayCapture", value: []},
                {key: "embedExtensions", value: ["https://2.com"]},
            ],
        ]
        for (const originalPermissions of cases) {
            expect(cleanPermissions(originalPermissions).length).toBe(originalPermissions.length)
            const allowAll = {key: ALLOW_ALL_PERMISSIONS, value: []}
            const cleaned = cleanPermissions([
                allowAll,
                ...originalPermissions
            ])
            expect(cleaned.length).toBe(1)
            expect(cleaned).toStrictEqual([allowAll])
        }
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

describe("unsafe permissions detector", () => {
    it(`"${ALLOW_ALL_PERMISSIONS}" permission return true`, () => {
        const summary = generatePermissionsSummary([{key: ALLOW_ALL_PERMISSIONS, value: []}])
        expect(hasUnsafePermissions(summary)).toBe(true)
    })

    it(`web request permission with "${ALLOW_ALL_PERMISSIONS}" return true`, () => {
        const summary = generatePermissionsSummary([{
            key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]
        }])
        expect(hasUnsafePermissions(summary)).toBe(true)
    })

    it(`embed extensions permission with any value other than empty return true`, () => {
        const allowAll = generatePermissionsSummary([{
            key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS]
        }])
        expect(hasUnsafePermissions(allowAll)).toBe(true)
        const notAllowAll = generatePermissionsSummary([{
            key: "embedExtensions", value: ["https://random.https/", "https://coolio.com"]
        }])
        expect(hasUnsafePermissions(notAllowAll)).toBe(true)
        const empty = generatePermissionsSummary([{
            key: "embedExtensions", value: []
        }])
        expect(hasUnsafePermissions(empty)).toBe(false)
    })

    it("mixing multiple dangerous permission together should return true", () => {
        const cases = [
            [{key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS]}, {key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]}],
            [{key: ALLOW_ALL_PERMISSIONS, value: []}, {key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]}],
        ]
        for (const c of cases) {
            const summary = generatePermissionsSummary(c)
            expect(hasUnsafePermissions(summary)).toBe(true)
        }
    })

    it("mixing root permissions with other permissions should return true", () => {
        const cases = [
            [{key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS]}, {key: "geoLocation", value: []}],
            [{key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]}, {key: "camera", value: []}],
            [{key: ALLOW_ALL_PERMISSIONS, value: []}, {key: "fullScreen", value: []}, {key: "files", value: ["read"]}],
        ]
        for (const c of cases) {
            const summary = generatePermissionsSummary(c)
            expect(hasUnsafePermissions(summary)).toBe(true)
        }
    })

    it("non-root permissions should return false", () => {
        const cases = [
            [{key: "microphone", value: []}, {key: "geoLocation", value: []}],
            [{key: "allowUnsafeEval", value: []}, {key: "camera", value: []}],
            [{key: "gameSaves", value: ["read", "write"]}, {key: "fullScreen", value: []}, {key: "files", value: ["read"]}],
        ]
        for (const c of cases) {
            const summary = generatePermissionsSummary(c)
            expect(hasUnsafePermissions(summary)).toBe(false)
        }
    })
})

const DUMMY_CARGOS: [CargoIndex, CargoIndex, CargoIndex] = [
    {
        id: "random1",
        name: "cool1",
        logoUrl: NULL_FIELD,
        resolvedUrl: `https://my-mamas-house.com/pkg/`,
        canonicalUrl: `https://my-mamas-house.com/pkg/`,
        bytes: 100,
        entry: `index.js`,
        version: "2.1.0",
        permissions: [],
        storageBytes: 0,
        state: "cached",
        createdAt: 0,
        updatedAt: 0,
        downloadQueueId: ""
    },
    {
        id: "random4",
        name: "cool2",
        logoUrl: NULL_FIELD,
        resolvedUrl: `https://my-dadas-house.com/pkg/`,
        canonicalUrl: `https://my-dadas-house.com/pkg/`,
        bytes: 100,
        entry: `index.js`,
        version: "32.3.0",
        permissions: [],
        storageBytes: 0,
        state: "cached",
        createdAt: 0,
        updatedAt: 0,
        downloadQueueId: ""
    },
    {
        id: "random3",
        name: "cool12",
        logoUrl: NULL_FIELD,
        resolvedUrl: `https://my-aunties-house.com/pkg/`,
        canonicalUrl: `https://my-aunties-house.com/pkg/`,
        bytes: 100,
        entry: `index.js`,
        version: "0.2.3",
        permissions: [],
        storageBytes: 0,
        state: "cached",
        createdAt: 0,
        updatedAt: 0,
        downloadQueueId: ""
    },
]

describe("merging permission summaries", () => {
    it("permissions without any embed extensions or with embed all permission, should return original permissions", () => {
        const cases = [
            [{key: "embedExtensions", value: [ALLOW_ALL_PERMISSIONS]}],
            [{key: "embedExtensions", value: []}],
            [{key: "camera", value: []}, {key: "geoLocation", value: []}],
            [{key: "gameSaves", value: ["read", "write"]}],
        ]
        const cargoIndex = emptyCargoIndices()
        cargoIndex.cargos.push(...structuredClone(DUMMY_CARGOS))
        for (const permissions of cases) {
            const summary = generatePermissionsSummary(permissions)
            const merged = mergePermissionSummaries(summary, cargoIndex)
            expect(structuredClone(summary)).toStrictEqual(merged)
        }
    })

    it("if embedExtensions targets are valid but do not exist in cargoIndices, original permissions should be returned", () => {
        const cases = [
            [{key: "embedExtensions", value: [DUMMY_CARGOS[0].canonicalUrl + Math.random()]}],
            [{key: "embedExtensions", value: [DUMMY_CARGOS[2].canonicalUrl + Math.random()]}],
        ]
        const cargoIndex = emptyCargoIndices()
        for (const c of cases) {
            const {value} = c[0]
            for (const v of value) {
                expect(cargoIndex.cargos.find((cargo) => cargo.canonicalUrl === v)).toBe(undefined)
            }
        }
        cargoIndex.cargos.push(...structuredClone(DUMMY_CARGOS))
        for (const permissions of cases) {
            const summary = generatePermissionsSummary(permissions)
            const merged = mergePermissionSummaries(summary, cargoIndex)
            expect(structuredClone(summary)).toStrictEqual(merged)
        }
    })

    it("if embedExtensions targets exist but include unsafe permissions, original permissions should be returned", () => {
        const cloned = structuredClone(DUMMY_CARGOS)
        const embedLinks = cloned.map((index) => index.canonicalUrl)
        const permissions = [
            [{key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]}],
            [{key: ALLOW_ALL_PERMISSIONS, value: []}],
            [{key: "embedExtensions", value: ["https://hey.com"]}],
        ]
        for (let i = 0; i < cloned.length; i++) {
            const target = cloned[i]
            target.permissions = permissions[i]
            const summary = generatePermissionsSummary(target.permissions)
            expect(hasUnsafePermissions(summary)).toBe(true)
        }
        const cargoIndexes = emptyCargoIndices()
        cargoIndexes.cargos = cloned
        for (const url of embedLinks) {
            expect(cargoIndexes.cargos.find((cargo) => cargo.canonicalUrl === url)).not.toBe(undefined)
        }
        const mainPermissions = [
            {key: "embedExtensions", value: [...embedLinks]}
        ]
        const mainSummary = generatePermissionsSummary(mainPermissions)
        const merged = mergePermissionSummaries(mainSummary, cargoIndexes)
        expect(structuredClone(merged)).toStrictEqual(mainSummary)
    })

    it("original permissions should inherit embed target permissions and add there resolved urls to webRequest permission if they exist in cargo index", () => {
        const cloned = structuredClone(DUMMY_CARGOS)
        const permissions = [
            [{key: "camera", value: []}, {key: "webRequest", value: ["https://hey.com", "https://google.com"]}],
            [{key: "geoLocation", value: []}],
            [{key: "gameSaves", value: ["read", "write"]}, {key: "fullScreen", value: []}],
        ]
        for (let i = 0; i < cloned.length; i++) {
            cloned[i].permissions = permissions[i]
        }

        const cargoIndex = emptyCargoIndices()
        cargoIndex.cargos.push(...cloned)
        const cargosToMerge = [
            [0, 1, 2],
            [0, 1],
            [0, 2],
            [1, 2],
            [0],
            [1],
            [2],
        ] as const
        for (const c of cargosToMerge) {
            const originalPermissions = [{
                key: "embedExtensions", 
                value: c.map((index) => cloned[index].canonicalUrl)
            }]
            const originalSummary = generatePermissionsSummary(originalPermissions)
            const mergedSummary = mergePermissionSummaries(
                originalSummary, cargoIndex
            )
            expect(structuredClone(originalSummary)).not.toStrictEqual(mergedSummary)
            // merges all permissions and adds the resolved
            // urls of embed targets to web requests
            const cargoUrls = c.map((index) => cloned[index].resolvedUrl)
            const mergedPermissions = c
                .map((index) => cloned[index].permissions)
                .flat()
            const extraWebRequests = mergedPermissions
                .filter((permission) => permission.key === "webRequest")
                .map(({value}) => value)
                .flat()
            const cleanedPermissions = [
                ...mergedPermissions.filter((permission) => permission.key !== "webRequest"),
                {key: "webRequest", value: [...cargoUrls, ...extraWebRequests]}
            ]
            const cleanedSummary = generatePermissionsSummary(cleanedPermissions)
            const cleanedCopy = structuredClone(cleanedSummary)
            cleanedCopy.webRequest.sort()
            const mergedCopy = structuredClone(mergedSummary)
            mergedCopy.webRequest.sort()
            expect(cleanedCopy).toStrictEqual(mergedCopy)
        }
    })

    it(`original permissions should inherit embed target permissions and webRequest should only have the "${ALLOW_ALL_PERMISSIONS}" value if original permission possess it, permission if they exist in cargo index`, () => {
        const cloned = structuredClone(DUMMY_CARGOS)
        const permissions = [
            [{key: "camera", value: []}, {key: "webRequest", value: ["https://hey.com", "https://google.com"]}],
            [{key: "geoLocation", value: []}],
            [{key: "gameSaves", value: ["read", "write"]}, {key: "fullScreen", value: []}],
        ]
        for (let i = 0; i < cloned.length; i++) {
            cloned[i].permissions = permissions[i]
        }

        const cargoIndex = emptyCargoIndices()
        cargoIndex.cargos.push(...cloned)
        const cargosToMerge = [
            [0, 1, 2],
            [0, 1],
            [0, 2],
            [1, 2],
            [0],
            [1],
            [2],
        ] as const
        for (const c of cargosToMerge) {
            const allowAllRequests = {key: "webRequest", value: [ALLOW_ALL_PERMISSIONS]}
            const originalPermissions = [
                {key: "embedExtensions", value: c.map((index) => cloned[index].canonicalUrl)},
                structuredClone(allowAllRequests)
            ]
            const originalSummary = generatePermissionsSummary(originalPermissions)
            const mergedSummary = mergePermissionSummaries(
                originalSummary, cargoIndex
            )
            expect(structuredClone(originalSummary)).not.toStrictEqual(mergedSummary)
            const mergedPermissions = c
                .map((index) => cloned[index].permissions)
                .flat()
            const cleanedPermissions = [
                ...mergedPermissions.filter((permission) => permission.key !== "webRequest"),
                structuredClone(allowAllRequests)
            ]
            const cleanedSummary = generatePermissionsSummary(cleanedPermissions)
            const cleanedCopy = structuredClone(cleanedSummary)
            cleanedCopy.webRequest.sort()
            const mergedCopy = structuredClone(mergedSummary)
            mergedCopy.webRequest.sort()
            expect(cleanedCopy).toStrictEqual(mergedCopy)
        }
    })
})

describe("diffing permissions", () => {
    it("if no permission are found in old or new permissions, an empty array should be returned", () => {
        expect(diffPermissions([], [])).toStrictEqual({added: [], removed: []})
    })

    it("if permission is present in old permissions but not new permissions, the return value of removed should reflect that", () => {
        const cases = [
            {
                oldPermissions: [
                    {key: "camera", value: []},
                    {key: "geoLocation", value: []},
                    {key: "pointerLock", value: []},
                ],
                newPermissions: [
                    {key: "camera", value: []},
                    {key: "pointerLock", value: []},
                ] 
            },
            {
                oldPermissions: [
                    {key: "camera", value: []},
                    {key: "fullScreen", value: []},
                    {key: "pointerLock", value: []},
                ],
                newPermissions: [
                    {key: "camera", value: []},
                    
                ] 
            },
            {
                oldPermissions: [
                    {key: "camera", value: []},
                ],
                newPermissions: [
                    {key: "camera", value: []},
                    {key: "displayCapture", value: []}
                ] 
            },
        ]
        for (const {oldPermissions, newPermissions} of cases) {
            const {removed} = diffPermissions(oldPermissions, newPermissions)
            for (const {key} of oldPermissions) {
                const foundInNewPermissions = newPermissions.find((permission) => {
                    return permission.key === key
                })
                const existsInRemoved = !!(removed.find((permission) => permission.key === key))
                if (!foundInNewPermissions) {
                    expect(existsInRemoved).toBe(true)
                } else {
                    expect(existsInRemoved).toBe(false)
                }
            }
        }
    })

    it("if permission value is present in old permissions but not new permissions, the return value of removed should reflect that", () => {
        const cases = [
            {
                oldPermissions: [
                    {key: "webRequest", value: ["https://yes.com", "https://hi.com"]},
                    {key: "embedExtensions", value: ["https://1.com", "https://2.com"]},
                ],
                newPermissions: [
                    {key: "webRequest", value: ["https://yes.com"]},
                    {key: "embedExtensions", value: ["https://2.com"]},
                ] 
            },
            {
                oldPermissions: [
                    {key: "webRequest", value: ["https://hi.com"]},
                    {key: "embedExtensions", value: ["https://1.com", "https://2.com"]},
                ],
                newPermissions: [
                    {key: "webRequest", value: ["https://yes.com", "https://hi2.com"]},
                    {key: "embedExtensions", value: ["https://2.com"]},
                ] 
            },
            {
                oldPermissions: [
                    {key: "webRequest", value: ["https://hi.com", "https://no.com", "https://lets-decide-together.com"]},
                    {key: "embedExtensions", value: ["https://1.com", "https://2.com"]},
                ],
                newPermissions: [
                    {key: "webRequest", value: ["https://yes.com", "https://hi2.com"]},
                    {key: "embedExtensions", value: ["https://2.com"]},
                ] 
            },
        ]
        for (const {oldPermissions, newPermissions} of cases) {
            const {removed} = diffPermissions(oldPermissions, newPermissions)
            for (const {key, value} of oldPermissions) {
                const newPermissionTwin = newPermissions.find((permission) => {
                    return permission.key === key
                })
                expect(newPermissionTwin).not.toBe(undefined)
                for (const oldPermissionValue of value) {
                    const valueExistsInNewPermissions = newPermissionTwin?.value
                        .find((v) => v === oldPermissionValue)
                    const removedPermissions = removed.find(
                        (permission) => permission.key === key
                    )
                    expect(removedPermissions).not.toBe(undefined)
                    const removedPermissionsValue = removedPermissions?.value
                        .find((v) => v === oldPermissionValue)
                    if (valueExistsInNewPermissions) {
                        expect(removedPermissionsValue).toBe(undefined)
                    } else {
                        expect(removedPermissionsValue).not.toBe(undefined)
                    }
                }
            }
        }
    })

    it("if permission is added in new permissions, the return value of added should reflect that", () => {
        const cases = [
            {
                oldPermissions: [
                    {key: "camera", value: []},
                ],
                newPermissions: [
                    {key: "camera", value: []},
                    {key: "pointerLock", value: []},
                ] 
            },
            {
                oldPermissions: [
                    {key: "camera", value: []},
                    {key: "fullScreen", value: []},
                    
                ],
                newPermissions: [
                    {key: "camera", value: []},
                    {key: "pointerLock", value: []},
                ] 
            },
            {
                oldPermissions: [
                    {key: "camera", value: []},
                ],
                newPermissions: [
                    {key: "geoLocation", value: []},
                    {key: "displayCapture", value: []}
                ] 
            },
        ]
        for (const {oldPermissions, newPermissions} of cases) {
            const {added} = diffPermissions(oldPermissions, newPermissions)
            for (const {key} of newPermissions) {
                const foundInOldPermissions = oldPermissions.find((permission) => {
                    return permission.key === key
                })
                const existsInAdded = !!(added.find((permission) => permission.key === key))
                if (!foundInOldPermissions) {
                    expect(existsInAdded).toBe(true)
                } else {
                    expect(existsInAdded).toBe(false)
                }
            }
        }
    })

    it("if permission value is present in new permissions but not old permissions, the return value of added should reflect that", () => {
        const cases = [
            {
                oldPermissions: [
                    {key: "webRequest", value: ["https://yes.com"]},
                    {key: "embedExtensions", value: ["https://1.com", "https://2.com"]},
                ],
                newPermissions: [
                    {key: "webRequest", value: ["https://yes.com", "https://maybe.com"]},
                    {key: "embedExtensions", value: ["https://2.com", "https://3.com", "https://4.com"]},
                ] 
            },
            {
                oldPermissions: [
                    {key: "webRequest", value: ["https://no.com"]},
                    {key: "embedExtensions", value: ["https://1.com"]},
                ],
                newPermissions: [
                    {key: "webRequest", value: ["https://yes.com", "https://maybe.com"]},
                    {key: "embedExtensions", value: ["https://2.com", "https://3.com", "https://4.com"]},
                ] 
            },
            {
                oldPermissions: [
                    {key: "webRequest", value: ["https://yes.com"]},
                    {key: "embedExtensions", value: ["https://1.com", "https://2.com"]},
                ],
                newPermissions: [
                    {key: "webRequest", value: ["https://maybe.com"]},
                    {key: "embedExtensions", value: ["https://3.com"]},
                ] 
            },
        ]
        for (const {oldPermissions, newPermissions} of cases) {
            const {added} = diffPermissions(oldPermissions, newPermissions)
            for (const {key, value} of newPermissions) {
                const oldPermissionTwin = oldPermissions.find((permission) => {
                    return permission.key === key
                })
                expect(oldPermissionTwin).not.toBe(undefined)
                for (const newPermissionValue of value) {
                    const valueExistsInOldPermissions = oldPermissionTwin?.value
                        .find((v) => v === newPermissionValue)
                    const addedPermissions = added.find(
                        (permission) => permission.key === key
                    )
                    expect(addedPermissions).not.toBe(undefined)
                    const addedPermissionsValue = addedPermissions?.value
                        .find((v) => v === newPermissionValue)
                    if (valueExistsInOldPermissions) {
                        expect(addedPermissionsValue).toBe(undefined)
                    } else {
                        expect(addedPermissionsValue).not.toBe(undefined)
                    }
                }
            }
        }
    })

    it("if new permissions are the exact same as old permissions, the 'added' and 'removed' should be empty", () => {
        const cases = [
            [
                {key: "webRequest", value: ["https://yes.com"]},
                {key: "embedExtensions", value: ["https://1.com"]},
            ],
            [
                {key: "camera", value: []},
                {key: "geoLocation", value: []},
            ],
            [
                {key: "pointerLock", value: []},
                {key: "webRequest", value: ["https://yes.com", "https://no.com", "https://maybe.com"]},
            ],
            [],
            [
                {key: "fullScreen", value: []}
            ],
            [
                {key: "gameSaves", value: ["read", "write"]},
                {key: "files", value: ["read"]},
            ]
        ]
        for (const c of cases) {
            const {added, removed} = diffPermissions(c, c)
            expect(added).toStrictEqual([])
            expect(removed).toStrictEqual([])
        }
    })

    it(`if new permissions include "${ALLOW_ALL_PERMISSIONS}" permission and old does not, return type of added should be an array with only the "${ALLOW_ALL_PERMISSIONS}" permission and removed should be an empty array`, () => {
        const cases = [
            [
                {key: "camera", value: []},
                {key: "geoLocation", value: []},
            ],
            [
                {key: "webRequest", value: ["https://hey.com"]},
                {key: "fullScreen", value: []},
            ],
            [
                {key: "files", value: ["read"]},
            ]
        ]
        for (const oldPermissions of cases) {
            const newPermissions = [
                {key: ALLOW_ALL_PERMISSIONS, value: []}
            ]
            const {added, removed} = diffPermissions(oldPermissions, newPermissions)
            expect(added).toStrictEqual(newPermissions)
            expect(removed).toStrictEqual([])
        }
    })


    it(`if old permissions include "${ALLOW_ALL_PERMISSIONS}" permission and new does not, return type of added should be an empty array and removed should be an array with only the "${ALLOW_ALL_PERMISSIONS}" permission`, () => {
        const cases = [
            [
                {key: "camera", value: []},
                {key: "geoLocation", value: []},
            ],
            [
                {key: "webRequest", value: ["https://hey.com"]},
                {key: "fullScreen", value: []},
            ],
            [
                {key: "files", value: ["read"]},
            ]
        ]
        for (const newPermissions of cases) {
            const oldPermissions = [
                {key: ALLOW_ALL_PERMISSIONS, value: []}
            ]
            const {added, removed} = diffPermissions(oldPermissions, newPermissions)
            expect(added).toStrictEqual([])
            expect(removed).toStrictEqual(oldPermissions)
        }
    })
})