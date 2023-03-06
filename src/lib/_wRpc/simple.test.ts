import {expect, describe, it} from "vitest"
import {wRpc} from "./simple"

const mockWorker = () => ({
    postMessage(data: any) {
        this._adjacentWorker?._recieveMessage(data)
    },
    addEventListener(_: "message", callback: Function) {
        this._callback = callback
    },
    removeEventListener(_: "message", callback: Function) {

    },

    _adjacentWorker: null as null | {
        _recieveMessage: (data: any) => any
    },
    _callback: (() => {}) as Function,
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

        const terminal1 = new wRpc<typeof terminalTwoActions>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {}
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(await terminal1.execute("ping")).toBe(3)
        expect(await terminal2.execute("ping")).toBe(2)
    })

    it("complex responses work", async () => {
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

        const t1 = new wRpc<typeof terminalTwoActions>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {}
        })

        const t2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(await t1.execute("complexAction", ["meapo"])).toBeInstanceOf(Map)
        expect(await t2.execute("doCoolStuff", {data: 100})).toStrictEqual({
            status: 1,
            tags: ["ok"]
        })
    })

    it("transferable objects should not be passed to executing function", async () => {
        const terminalOneActions = {
            ping: () => true,
            doCoolStuff: (...args: [ArrayBuffer]) => {
                const [data] = args
                expect(data).toBeInstanceOf(ArrayBuffer)
                return wRpc.transfer(data, [data])
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

        const t1 = new wRpc<typeof terminalTwoActions>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {},
        })

        const t2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(await t1.execute("complexAction", ["meapo"])).toBeInstanceOf(Map)
        
        const buffer = new ArrayBuffer(100)
        const res = await t2.execute("doCoolStuff", buffer, [buffer])
        expect(res).toBeInstanceOf(ArrayBuffer)
    })
})

describe("terminal state", () => {
    it("terminal state should be passed to all terminal functions", async () => {
        
        const mockState = {
            cool: 1,
            yes: "str",
            config: true
        }

        const terminalOneActions = {
            ping: (...args: unknown[]) => {
                expect(args[1]).toStrictEqual(mockState)
                return true
            },
            doCoolStuff: (param: ArrayBuffer, state: typeof mockState) => {
                expect(state).toStrictEqual(mockState)
                expect(param).toBeInstanceOf(ArrayBuffer)
                return wRpc.transfer(param, [param])
            }
        } as const
        
        const terminalTwoActions = {
            complexAction: (names: string[], state: typeof mockState) => {
                expect(state).toStrictEqual(mockState)
                expect(names).toStrictEqual(["meapo"])
                return new Map()
            }
        }
        
        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const t1 = new wRpc<typeof terminalTwoActions, typeof mockState>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {...mockState},
        })

        const t2 = new wRpc<typeof terminalOneActions, typeof mockState>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {...mockState}
        })

        expect(await t1.execute("complexAction", ["meapo"])).toBeInstanceOf(Map)
        
        const buffer = new ArrayBuffer(100)
        const res = await t2.execute("doCoolStuff", buffer, [buffer])
        expect(res).toBeInstanceOf(ArrayBuffer)

        expect(await t2.execute("ping")).toBe(true)
    })

    it("state should persist for lifetime of terminal", async () => {
        const mockState = {pingCount: 0}
        const terminalOneActions = {
            pingIncrement: (_: null, state: typeof mockState) => {
                return state.pingCount++
            },
        } as const
        
        const terminalTwoActions = {
            laterPing: (_: null, state: typeof mockState) => {
                return state.pingCount
            }
        }
        
        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const t1 = new wRpc<typeof terminalTwoActions, typeof mockState>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {...mockState},
        })

        const t2 = new wRpc<typeof terminalOneActions, typeof mockState>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {...mockState}
        })

        for (let i = 0; i < 5; i++) {
            expect(await t2.execute("pingIncrement")).toBe(i)
        }

        expect(await t1.execute("laterPing")).toBe(0)
    })
})

describe("error handling", () => {
    it("if rpc encounters exception, exception should be returned to caller, contained where rpc took place, and prevent hanging between rpcs", async () => {
        const terminalOneActions = {
            ping: () => {
                throw new Error("err")
                return 2
            }
        } as const
        
        const terminalTwoActions = {
            ping: () => {
                throw new Error("random error")
                return 3
            }
        } as const

        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const terminal1 = new wRpc<typeof terminalTwoActions>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {},
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(
            async () => await terminal1.execute("ping")
        ).rejects.toThrow()
        expect(
            async () => await terminal2.execute("ping")
        ).rejects.toThrow()
    })

    it("if non-existent handler is called, an exception should be returned", async () => {
        const terminalOneActions = {
            ping: () => {
                throw new Error("err")
                return 2
            }
        } as const
        
        const terminalTwoActions = {
            ping: () => {
                throw new Error("random error")
                return 3
            }
        } as const

        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const terminal1 = new wRpc<typeof terminalTwoActions>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {},
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(
            async () => await terminal1.execute("ping")
        ).rejects.toThrow()
        expect(
            async () => await terminal2.execute("ping")
        ).rejects.toThrow()
    })
})

describe("terminal rpcs can be added after initialization", () => {
    it("calling new rpc function after being added should not return error", async () => {
        const terminalOneActions = {ping: () => 2}
        
        const terminalTwoActions = {ping: () => 3}
        const t2AdditionalActions = {ping2: () => 4}

        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const terminal1 = new wRpc<
            typeof terminalTwoActions
            & typeof t2AdditionalActions
        >({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {}
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(await terminal1.execute("ping")).toBe(3)
        expect(await terminal2.execute("ping")).toBe(2)

        expect(async () => terminal1.execute("ping2")).rejects.toThrow()

        const addResponse = terminal2.addResponses(t2AdditionalActions)
        expect(addResponse).toBe(true)

        expect(await terminal1.execute("ping2")).toBe(4)
    })

    it("if allow overwrite option is set to false, then overwrite should not be allowed", async () => {
        const terminalOneActions = {ping: () => 2}
        
        const terminalTwoActions = {ping: () => 3}
        const t2AdditionalActions = {ping: () => 4}

        const t1Worker = mockWorker()
        const t2Worker = mockWorker()
        t1Worker._adjacentWorker = t2Worker
        t2Worker._adjacentWorker = t1Worker

        const terminal1 = new wRpc<
            typeof terminalTwoActions
            & typeof t2AdditionalActions
        >({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            state: {}
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            state: {}
        })

        expect(await terminal1.execute("ping")).toBe(3)
        expect(await terminal2.execute("ping")).toBe(2)

        const addResponse = terminal2.addResponses(t2AdditionalActions, {
            allowOverwrite: false
        })
        expect(addResponse).toBe(false)

        expect(await terminal1.execute("ping")).toBe(3)
    })
})