import {expect, describe, it} from "vitest"
import {gameSaveRpcs} from "."
import {Mutable} from "../../../types/utility"
import {cloneDeps} from "../testLib/stateGenerator"

type GameSaveRpcKeys = keyof ReturnType<typeof gameSaveRpcs>

const gameSaveReadRpcs = [
    "getSaveFile"
] as const satisfies ReadonlyArray<GameSaveRpcKeys>

const gameSaveWriteRpcs = [
    "createSave"
] as const satisfies ReadonlyArray<GameSaveRpcKeys>

describe("rpcs for game saves", () => {
    it("factory should return only allowed rpcs", () => {
        const tests = [
            {key: "gameSaves", value: []},
            {key: "gameSaves", value: ["read"]},
            {key: "gameSaves", value: ["read", "write"]},
            {key: "gameSaves", value: ["write"]},
        ] as const

        for (const {key, value} of tests) {
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