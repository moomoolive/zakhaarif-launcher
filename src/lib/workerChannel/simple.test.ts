import {expect, describe, it} from "vitest"
import {Rpc} from "./simple"

describe("creating terminal", () => {
    it("recipent actions created successfully", () => {
        const recipentFunctions = {
            ping: () => 1,
            complexAction: (data: {}) => {
                return {}
            }
        }

        const terminal = Rpc.create({
            functions: {},
            recipentFunctions,
            recipentWorker: {
                postMessage: () => {},
                addEventListener: () => {},
            },
        })
        const recipentActionKeys = Object.keys(recipentFunctions)
        for (const key of recipentActionKeys) {
            expect(key in terminal).toBe(true)
        }
    })
})

const mockWorker = () => ({
    _adjacentWorker: null as null | {
        _recieveMessage: (data: any) => any
    },
    _callback: null as null | Function,
    postMessage(data: any) {
        this._adjacentWorker?._recieveMessage(data)
    },
    addEventListener(_: "message", callback: Function) {
        this._callback = callback
    },
    _recieveMessage(data: any) {
        if (this._callback) {
            this._callback({data})
        }
    }
})

describe("terminal communication", () => {
    it("terminal can send message", async () => {
        const terminalOneActions = {ping: () => 2} as const
        
        const terminalTwoActions = {ping: () => 3}

        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const terminal1 = Rpc.create({
            functions: terminalOneActions,
            recipentFunctions: terminalTwoActions,
            recipentWorker: t2Worker
        })

        const terminal2 = Rpc.create({
            functions: terminalTwoActions,
            recipentFunctions: terminalOneActions,
            recipentWorker: t1Worker
        })

        expect(await terminal1.ping()).toBe(3)
        expect(await terminal2.ping()).toBe(2)
    })

    it("complex functions work", async () => {
        const terminalOneActions = {
            doCoolStuff: (input: {data: number}) => {
                expect(input).toStrictEqual({
                    data: 100
                })
                return {
                    status: 1,
                    tags: ["ok"]
                }
            }
        } as const
        
        const terminalTwoActions = {
            complexAction: (names: string[]) => {
                expect(names).toStrictEqual(["meapo"])
                return new Map()
            }
        }
        
        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const t1 = Rpc.create({
            functions: terminalOneActions,
            recipentFunctions: terminalTwoActions,
            recipentWorker: t2Worker
        })

        const t2 = Rpc.create({
            functions: terminalTwoActions,
            recipentFunctions: terminalOneActions,
            recipentWorker: t1Worker
        })

        expect(await t1.complexAction(["meapo"])).toBeInstanceOf(Map)
        expect(await t2.doCoolStuff({data: 100})).toStrictEqual({
            status: 1,
            tags: ["ok"]
        })
    })

    it("transferable objects should not be passed to executing function", async () => {
        const terminalOneActions = {
            doCoolStuff: (...args: [ArrayBuffer]) => {
                expect(args.length).toBe(1)
                const [data] = args
                expect(data).toBeInstanceOf(ArrayBuffer)
                return Rpc.transfer(data, [data])
            }
        } as const
        
        const terminalTwoActions = {
            complexAction: (names: string[]) => {
                expect(names).toStrictEqual(["meapo"])
                return new Map()
            }
        }
        
        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const t1 = Rpc.create({
            functions: terminalOneActions,
            recipentFunctions: terminalTwoActions,
            recipentWorker: t2Worker
        })

        const t2 = Rpc.create({
            functions: terminalTwoActions,
            recipentFunctions: terminalOneActions,
            recipentWorker: t1Worker
        })

        expect(await t1.complexAction(["meapo"])).toBeInstanceOf(Map)
        
        const buffer = new ArrayBuffer(100)
        const res = await t2.doCoolStuff(buffer, [buffer])
        expect(res).toBeInstanceOf(ArrayBuffer)
    })
})