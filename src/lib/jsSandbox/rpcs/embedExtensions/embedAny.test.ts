import {expect, describe, it} from "vitest"
import {embedAnyExtensionRpcs} from "./embedAny"
import {ALLOW_ALL_EMBEDS} from "../../../types/permissions"
import {cloneDeps} from "../testLib/stateGenerator"

describe("rpcs for embedding any extension", () => {
    it("should return valid rpc functions if permissions allow embeding all extensions & permissions have not been configured yet", () => {
        const {state} = cloneDeps({
            permissions: [
                {key: "embedExtensions", value: [ALLOW_ALL_EMBEDS]}
            ],
            persistentState: {
                configuredPermissions: false
            }
        })
        const rpcs = embedAnyExtensionRpcs(state)
        expect(rpcs.reconfigurePermissions).toBeTypeOf("function")
    })

    it("should return an emtpy object if permissions do not allow embeding all extensions", () => {
        const {state} = cloneDeps({
            permissions: [],
            persistentState: {
                configuredPermissions: false
            }
        })
        const rpcs = embedAnyExtensionRpcs(state)
        expect(rpcs).toStrictEqual({})
        expect(rpcs.reconfigurePermissions).toBeTypeOf("undefined")
    })

    it("should return an emtpy object if permissions allow embeding all extensions & permissions have already been configured", () => {
        const {state} = cloneDeps({
            permissions: [
                {key: "embedExtensions", value: [ALLOW_ALL_EMBEDS]}
            ],
            persistentState: {
                configuredPermissions: true
            }
        })
        const rpcs = embedAnyExtensionRpcs(state)
        expect(rpcs).toStrictEqual({})
        expect(rpcs.reconfigurePermissions).toBeTypeOf("undefined")
    })

    it("attempting to call reconfigurePermissions when permissions have already been configured should return false", () => {
        let embedUrlsCalled = false
        const {state, persistentState} = cloneDeps({
            permissions: [
                {key: "embedExtensions", value: [ALLOW_ALL_EMBEDS]}
            ],
            persistentState: {
                configuredPermissions: false,
                setEmbedUrls: () => { embedUrlsCalled = true }
            }
        })
        const rpcs = embedAnyExtensionRpcs(state)
        persistentState.configuredPermissions = true
        const response = rpcs.reconfigurePermissions({canonicalUrls: []}, state)
        expect(response).toBe(false)
        expect(embedUrlsCalled).toBe(false)
    })

    it("attempting to call reconfigurePermissions with wrong type of input should return false", () => {
        const tests = [
            null, {}, 1, false, undefined, [],
            "hi", Symbol(), 
            {canonicalUrls: null},
            {authToken: null},
            {canonicalUrls: Symbol()},
            {canonicalUrls: {}},
            {canonicalUrls: "hi"},
            {canonicalUrls: undefined}
        ] as const

        for (const test of tests) {
            let embedUrlsCalled = false
            const {state} = cloneDeps({
                permissions: [
                    {key: "embedExtensions", value: [ALLOW_ALL_EMBEDS]}
                ],
                persistentState: {
                    configuredPermissions: false,
                    setEmbedUrls: () => { embedUrlsCalled = true }
                }
            })
            const rpcs = embedAnyExtensionRpcs(state)
            const response = rpcs.reconfigurePermissions(test as any, state)
            expect(response).toBe(false)
        }
    })

    it("attempting to call reconfigurePermissions should filter out non-string permissions", () => {
        let embedUrl = [] as string[]
        const {state} = cloneDeps({
            permissions: [
                {key: "embedExtensions", value: [ALLOW_ALL_EMBEDS]}
            ],
            persistentState: {
                configuredPermissions: false,
                setEmbedUrls: (urls) => { embedUrl = urls }
            }
        })
        const rpcs = embedAnyExtensionRpcs(state)
        const params = {
            canonicalUrls: [
                "hi", undefined, {}, [], 1, 2, true, Symbol(), 1n
            ] as unknown as string[], 
            authToken: state.authToken
        }
        const response = rpcs.reconfigurePermissions(params, state)
        expect(response).toBe(true)
        expect(embedUrl).toStrictEqual(["hi"])
    })
})