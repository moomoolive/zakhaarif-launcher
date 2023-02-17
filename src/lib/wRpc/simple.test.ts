import {expect, describe, it} from "vitest"
import {wRpc} from "./simple"

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

        const terminal1 = new wRpc<typeof terminalTwoActions>({
            responses: terminalOneActions,
            messageTarget: t2Worker,
            messageInterceptor: t2Worker,
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            messageInterceptor: t1Worker
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
            messageInterceptor: t2Worker,
        })

        const t2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            messageInterceptor: t1Worker,
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
            messageInterceptor: t2Worker,
        })

        const t2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            messageInterceptor: t1Worker
        })

        expect(await t1.execute("complexAction", ["meapo"])).toBeInstanceOf(Map)
        
        const buffer = new ArrayBuffer(100)
        const res = await t2.execute("doCoolStuff", buffer, [buffer])
        expect(res).toBeInstanceOf(ArrayBuffer)
    })
})

describe("error handline", () => {
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
            messageInterceptor: t2Worker,
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            messageInterceptor: t1Worker,
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
            messageInterceptor: t2Worker,
        })

        const terminal2 = new wRpc<typeof terminalOneActions>({
            responses: terminalTwoActions,
            messageTarget: t1Worker,
            messageInterceptor: t1Worker,
        })

        expect(
            async () => await terminal1.execute("ping")
        ).rejects.toThrow()
        expect(
            async () => await terminal2.execute("ping")
        ).rejects.toThrow()
    })
})