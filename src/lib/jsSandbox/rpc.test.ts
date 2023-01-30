import {expect, describe, it} from "vitest"
import { Cargo } from "../cargo"
import {SandboxDependencies, RpcPersistentState, createRpcState, embedAnyExtensionRpcs, gameSaveRpcs} from "./rpc"
import {generatePermissionsSummary, cleanPermissions} from "../utils/security/permissionsSummary"
import {PermissionsList} from "../cargo"
import {Permissions, ALLOW_ALL_EMBEDS} from "../types/permissions"
import {Mutable} from "../types/utility"

const mockSandboxDependencies: SandboxDependencies = {
    displayExtensionFrame: () => {},
    minimumLoadTime: 0,
    queryState: "",
    createFatalErrorMessage: () => {},
    confirmExtensionExit: async () => {},
    cargoIndex: {
        id: "none",
        name: "none",
        logoUrl: "none",
        resolvedUrl: "",
        canonicalUrl: "",
        bytes: 0,
        entry: "",
        version: "0.1.0",
        permissions: [],
        state: "cached",
        createdAt: 0,
        updatedAt: 0,
    },
    cargo: new Cargo(),
    recommendedStyleSheetUrl: ""
}

const mockPersistentState: RpcPersistentState = {
    configuredPermissions: true,
    setEmbedUrls: () => {}
}

const clone = <T extends Object>(object: T) => {
    const clone = {} as Record<string, unknown>
    for (const [key, value] of Object.entries(object)) {
        if (typeof value === "function") {
            clone[key] = value
            continue
        }
        clone[key] = structuredClone(value)
    }
    return clone as T
}

type DependencyOverwrite = {
    sandboxDependencies?: Partial<SandboxDependencies>,
    persistentState?: Partial<RpcPersistentState>
    permissions?: PermissionsList<Permissions>
}

const cloneDeps = (overwrite: DependencyOverwrite = {}) => {
    const {
        sandboxDependencies: sDeps, 
        persistentState: pState,
        permissions = []
    } = overwrite
    const cleaned = cleanPermissions(permissions)
    
    const persistentState = {...clone(mockPersistentState), ...pState}
    const sandboxDependencies = {...clone(mockSandboxDependencies), ...sDeps}
    const permissionsSummary = generatePermissionsSummary(cleaned)
    const state = createRpcState(
        sandboxDependencies, 
        persistentState, 
        permissionsSummary
    )
    return {
        state, 
        sandboxDependencies, 
        permissionsSummary, 
        persistentState
    }
}

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
        expect(rpcs.reconfigurePermissions({canonicalUrls: [], authToken: ""})).toBe(false)
        expect(embedUrlsCalled).toBe(false)
    })

    it("attempting to call reconfigurePermissions with wrong type of input should return false", () => {
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
        expect(rpcs.reconfigurePermissions(null as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({} as any)).toBe(false)
        expect(rpcs.reconfigurePermissions(1 as any)).toBe(false)
        expect(rpcs.reconfigurePermissions(false as any)).toBe(false)
        expect(rpcs.reconfigurePermissions(undefined as any)).toBe(false)
        expect(rpcs.reconfigurePermissions([] as any)).toBe(false)
        expect(rpcs.reconfigurePermissions("hi" as any)).toBe(false)
        expect(rpcs.reconfigurePermissions(Symbol() as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: null} as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({authToken: null} as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: [], authToken: null} as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: {}, authToken: ""} as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: "hi", authToken: ""} as any)).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: undefined, authToken: ""} as any)).toBe(false)
        expect(embedUrlsCalled).toBe(false)
    })

    it("attempting to call reconfigurePermissions with wrong auth token should return false", () => {
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
        expect(rpcs.reconfigurePermissions({canonicalUrls: [], authToken: ""})).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: [], authToken: "adfjlaksjafldfjkaslk"})).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: [], authToken: "password"})).toBe(false)
        expect(rpcs.reconfigurePermissions({canonicalUrls: [], authToken: "hey"})).toBe(false)
        expect(embedUrlsCalled).toBe(false)
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
        expect(rpcs.reconfigurePermissions({canonicalUrls: ["hi", undefined, {}, [], 1, 2, true, Symbol(), 1n] as unknown as string[], authToken: state.authToken})).toBe(true)
        expect(embedUrl).toStrictEqual(["hi"])
    })
})

type GameSaveRpcKeys = keyof ReturnType<typeof gameSaveRpcs>

const gameSaveReadRpcs = [
    "getSaveFile"
] as const satisfies ReadonlyArray<GameSaveRpcKeys>

const gameSaveWriteRpcs = [
    "createSave"
] as const satisfies ReadonlyArray<GameSaveRpcKeys>

describe("rpcs for game saves", () => {
    it("factory should return only allowed rpcs", () => {
        const cases = [
            {key: "gameSaves", value: []},
            {key: "gameSaves", value: ["read"]},
            {key: "gameSaves", value: ["read", "write"]},
            {key: "gameSaves", value: ["write"]},
        ] as const
        for (const {key, value} of cases) {
            const {state, permissionsSummary} = cloneDeps({
                permissions: [{key, value: value as Mutable<typeof value>}]
            })
            const canRead = value.some((value) => value === "read")
            expect(permissionsSummary.gameSaves.read).toBe(canRead)
            const canWrite = value.some((value) => value === "write")
            expect(permissionsSummary.gameSaves.write).toBe(canWrite)
            const rpcs = gameSaveRpcs(state)
            for (const key of gameSaveReadRpcs) {
                const type = canRead ? "function" : "undefined"
                expect(rpcs[key]).toBeTypeOf(type)
            }
            for (const key of gameSaveWriteRpcs) {
                const type = canWrite ? "function" : "undefined"
                expect(rpcs[key]).toBeTypeOf(type)
            }
        }
    })
})