import { expect, it, describe } from "vitest"
import {cloneDeps} from "../testLib/stateGenerator"
import { exit, getInitialState, readyForDisplay, secureContextEstablished, signalFatalError } from "./index"

describe("establishing secure context", () => {
    it("calling secure context established should set secure context established to true", () => {
        const {state} = cloneDeps({})
        const response = secureContextEstablished(null, state)
        expect(response).toBe(true)
        expect(state.secureContextEstablished).toBe(true)
    })
})

describe("getting initial state", () => {
    it("initial state should return state object if secure context not established", () => {
        const {state} = cloneDeps({})
        const initalState = getInitialState(null, state)
        expect(initalState).not.toBe(null)
    })

    it("initial state should return null if secure context is established", () => {
        const {state} = cloneDeps({})
        state.secureContextEstablished = true
        const initalState = getInitialState(null, state)
        expect(initalState).toBe(null)
    })
})

describe("signaling fatal errors", () => {
    it("providing invalid type of input to should return false", () => {
        const tests = [
            "hi", 323, 1n, {}, [], {cool: true}, null,
            {extensionToken: null,},
            {details: 23,},
        ] as const
        const {state} = cloneDeps({})
        for (const test of tests) {
            const response = signalFatalError(test as any, state)
            expect(response).toBe(false)
            expect(state.fatalErrorOccurred).toBe(false)
        }
    })

    it("if secure context not established and valid input is provided, should return true even if auth token is incorrect", () => {
        const {state} = cloneDeps({})
        const incorrectAuthToken = "rand"
        expect(incorrectAuthToken).not.toBe(state.authToken)
        const response = signalFatalError({
            extensionToken: incorrectAuthToken,
            details: ""
        }, state)
        expect(response).toBe(true)
        expect(state.fatalErrorOccurred).toBe(true)
    })

    it("if secure context is established, valid input is provided, and auth token is incorrect, should return false", () => {
        const {state} = cloneDeps({})
        state.secureContextEstablished = true
        const incorrectAuthToken = "rand"
        expect(incorrectAuthToken).not.toBe(state.authToken)
        const response = signalFatalError({
            extensionToken: incorrectAuthToken,
            details: ""
        }, state)
        expect(response).toBe(false)
        expect(state.fatalErrorOccurred).toBe(false)
    })

    it("if secure context is established, valid input is provided, and auth token is correct, should return true", () => {
        const {state} = cloneDeps({})
        state.secureContextEstablished = true
        const response = signalFatalError({
            extensionToken: state.authToken,
            details: ""
        }, state)
        expect(response).toBe(true)
        expect(state.fatalErrorOccurred).toBe(true)
    })
})

describe("readying for display", () => {
    it("calling ready for display should set ready for display to true", () => {
        const {state} = cloneDeps({})
        expect(state.readyForDisplay).toBe(false)
        const response = readyForDisplay(null, state)
        expect(response).toBe(true)
        expect(state.readyForDisplay).toBe(true)
    })

    it("calling ready for display after call has already been made should return false", () => {
        const {state} = cloneDeps({})
        state.readyForDisplay = true
        const response = readyForDisplay(null, state)
        expect(response).toBe(false)
        expect(state.readyForDisplay).toBe(true)
    })

    it("calling ready for display after fatal error has been signaled should return false", () => {
        const {state} = cloneDeps({})
        state.fatalErrorOccurred = true
        const response = readyForDisplay(null, state)
        expect(response).toBe(false)
        expect(state.readyForDisplay).toBe(false)
    })
})

describe("exiting extension", () => {
    it("if fatal error has been signaled, should return false", async () => {
        const {state} = cloneDeps({})
        state.fatalErrorOccurred = true
        const response = await exit(state.authToken, state)
        expect(response).toBe(false)
    })

    it("if non string extension token is input, should return false", async () => {
        const tests = [1n, 3, false, true, "hi", {}, [], null] as const
        
        for (const test of tests) {
            const {state} = cloneDeps({})
            const response = await exit(test as any, state)
            expect(response).toBe(false)
        }
    })

    it("if incorrect extension token is input, should return false", async () => {
        const tests = [
            "herro",
            "yes-man",
            "a cool token",
            "adfasljkfkasdfj38901u0"
        ] as const
        
        for (const test of tests) {
            const {state} = cloneDeps({})
            const response = await exit(test, state)
            expect(response).toBe(false)
        }
    })

    it("if correct extension token is input, should return true", async () => {
        const {state} = cloneDeps({})
        const response = await exit(state.authToken, state)
        expect(response).toBe(true)
    })
})
