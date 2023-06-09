import {expect, it, describe} from "vitest"
import {ModLinkStatus} from "./core"

const linkstatus = (): ModLinkStatus => ({ok: true, errors: []})

describe("running lifecycle events", () => {
    it("test", () => {
        expect(true).toBe(true)
    })
})