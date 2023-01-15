import {expect, describe, it} from "vitest"
import {Rpc, MessagableEntity} from "./simpleServiceWorker"
import {Rpc as BaseRpc} from "./simple"

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
            globalScope: {
                addEventListener: () => {},
            },
        })
        const recipentActionKeys = Object.keys(recipentFunctions)
        for (const key of recipentActionKeys) {
            expect(key in terminal).toBe(true)
        }
    })
})

const mockSource = () => ({
    _adjacentSource: {postMessage: () => {}} as MessagableEntity,
    _callback: null as null | Function,
    postMessage(data: any) {
        if (!this._callback) {
            return
        }
        this._callback({
            data,
            waitUntil: async (promise: Promise<any>) => await promise,
            source: this._adjacentSource
        })
    },
    addEventListener(_: "message", callback: Function) {
        this._callback = callback
    },
})

describe("terminal communication", () => {
    it("terminal can send message", async () => {
        const sw1Actions = {ping: () => 2} as const
        const sw2Actions = {ping: () => 3} as const

        const serviceWorker2Scope = mockSource()
        const serviceWorker1Scope = mockSource()
        serviceWorker1Scope._adjacentSource = serviceWorker2Scope
        serviceWorker2Scope._adjacentSource = serviceWorker1Scope

        const sw1 = Rpc.create({
            functions: sw1Actions,
            recipentFunctions: sw2Actions,
            globalScope: serviceWorker1Scope
        })

        const sw2 = Rpc.create({
            functions: sw2Actions,
            recipentFunctions: sw1Actions,
            globalScope: serviceWorker2Scope
        })

        expect(await sw1.ping(serviceWorker2Scope)).toBe(3)
        expect(await sw2.ping(serviceWorker1Scope)).toBe(2)
    })

    it("complex messages can be sent", async () => {
        const complexArg = 20
        const complexReturn = {data: ["yes", "no", "maybeso"]}
        const sw1Actions = {
            complex: (num: number) => {
                expect(num).toBe(complexArg)
                return complexReturn
            }
        } as const
        
        const pingReturn = {
            data: {value: 2}
        }
        const pingArg = {inner: 3}
        const sw2Actions = {
            ping: (arg: typeof pingArg) => {
                expect(arg).toStrictEqual(pingArg)
                return pingReturn
            }
        } as const

        const serviceWorker2Scope = mockSource()
        const serviceWorker1Scope = mockSource()
        serviceWorker1Scope._adjacentSource = serviceWorker2Scope
        serviceWorker2Scope._adjacentSource = serviceWorker1Scope

        const sw1 = Rpc.create({
            functions: sw1Actions,
            recipentFunctions: sw2Actions,
            globalScope: serviceWorker1Scope
        })

        const sw2 = Rpc.create({
            functions: sw2Actions,
            recipentFunctions: sw1Actions,
            globalScope: serviceWorker2Scope
        })

        expect(
            await sw1.ping(serviceWorker2Scope, pingArg)
        ).toBe(pingReturn)
        expect(
            await sw2.complex(serviceWorker1Scope, complexArg)
        ).toStrictEqual(complexReturn)
    })

    it("transferable objects should not be passed to executing function", async () => {
        const sw1Actions = {
            transferStuff: (arg: ArrayBuffer) => {
                expect(arg).toBeInstanceOf(ArrayBuffer)
                return Rpc.transfer(arg, [arg])
            }
        } as const
        
        const pingReturn = {
            data: {value: 2}
        }
        const pingArg = {inner: 3}
        const sw2Actions = {
            ping: (arg: typeof pingArg) => {
                expect(arg).toStrictEqual(pingArg)
                return pingReturn
            }
        } as const

        const serviceWorker2Scope = mockSource()
        const serviceWorker1Scope = mockSource()
        serviceWorker1Scope._adjacentSource = serviceWorker2Scope
        serviceWorker2Scope._adjacentSource = serviceWorker1Scope

        const sw1 = Rpc.create({
            functions: sw1Actions,
            recipentFunctions: sw2Actions,
            globalScope: serviceWorker1Scope
        })

        const sw2 = Rpc.create({
            functions: sw2Actions,
            recipentFunctions: sw1Actions,
            globalScope: serviceWorker2Scope
        })

        expect(
            await sw1.ping(serviceWorker2Scope, pingArg)
        ).toBe(pingReturn)
        const buffer = new ArrayBuffer(100)
        const res =  await sw2.transferStuff(serviceWorker1Scope, buffer, [buffer])
        expect(res).toBeInstanceOf(ArrayBuffer)
    })

    it("if rpc throws an error, error should be returned to the caller and rpc should not hang", async () => {
        const sw1Actions = {ping: () => {
            throw new Error("err")
            return 2
        }} as const
        const sw2Actions = {ping: () => {
            throw new Error("err")
            return 3
        }} as const

        const serviceWorker2Scope = mockSource()
        const serviceWorker1Scope = mockSource()
        serviceWorker1Scope._adjacentSource = serviceWorker2Scope
        serviceWorker2Scope._adjacentSource = serviceWorker1Scope

        const sw1 = Rpc.create({
            functions: sw1Actions,
            recipentFunctions: sw2Actions,
            globalScope: serviceWorker1Scope
        })

        const sw2 = Rpc.create({
            functions: sw2Actions,
            recipentFunctions: sw1Actions,
            globalScope: serviceWorker2Scope
        })

        expect(
            async () => await sw1.ping(serviceWorker2Scope)
        ).rejects.toThrow()
        expect(
            async () => await sw2.ping(serviceWorker1Scope)
        ).rejects.toThrow()
    })
})

describe("integrating with other rpc terminals", () => {
    it("works with base rpc terminal", async () => {
        const swActions = {ping: () => 4} as const
        const workerActions = {ping: () => 3} as const

        const swScope = mockSource()
        const workerSource = mockSource()
        swScope._adjacentSource = workerSource

        const sw = Rpc.create({
            functions: swActions,
            recipentFunctions: workerActions,
            globalScope: swScope
        })

        const worker = BaseRpc.create({
            functions: workerActions,
            recipentFunctions: swActions,
            recipentWorker: {
                postMessage(data) {
                    swScope.postMessage(data)
                },
                addEventListener(_, handler) {
                    workerSource.addEventListener("message", handler)
                },
            }
        })

        expect(await worker.ping()).toBe(4)
        expect(await sw.ping(workerSource)).toBe(3)
    })

    it("transferable objects are passed correctly between base rpc and sw rpc", async () => {
        const swActions = {
            transfer: (buff: ArrayBuffer) => {
                expect(buff).toBeInstanceOf(ArrayBuffer)
                return Rpc.transfer(buff, [buff])
            }
        } as const
        const workerActions = {
            tranf: (buff: ArrayBuffer) => {
                expect(buff).toBeInstanceOf(ArrayBuffer)
                return BaseRpc.transfer(buff, [buff])
            }
        } as const

        const swScope = mockSource()
        const workerSource = mockSource()
        swScope._adjacentSource = workerSource

        const sw = Rpc.create({
            functions: swActions,
            recipentFunctions: workerActions,
            globalScope: swScope
        })

        const worker = BaseRpc.create({
            functions: workerActions,
            recipentFunctions: swActions,
            recipentWorker: {
                postMessage(data) {
                    swScope.postMessage(data)
                },
                addEventListener(_, handler) {
                    workerSource.addEventListener("message", handler)
                },
            }
        })

        const buff = new ArrayBuffer(5)
        const res = await worker.transfer(buff)
        expect(res).toBeInstanceOf(ArrayBuffer)
        const res1 = await sw.tranf(workerSource, buff)
        expect(res1).toBeInstanceOf(ArrayBuffer)
    })
})
