import {expect, it, describe} from "vitest"
import {WasmCoreApis, createWasmMemory} from "./coreTypes"
import {coreWasmModule} from "../test-utils"

const wasmmod = await coreWasmModule()
const wasmmem = createWasmMemory()

describe("wasm-core should intializable", () => {
    it("module is valid wasm", () => {
        expect(wasmmod).toBeInstanceOf(WebAssembly.Module)
    })

    it("should be able to be initialized without error", () => {
        const instance = new WebAssembly.Instance(wasmmod, {
            wbg: { memory: wasmmem }
        })
        expect(instance).toBeInstanceOf(WebAssembly.Instance)
    })

    it("core apis functions and globals should be exported", () => {
        const instance = new WebAssembly.Instance(wasmmod, {
            wbg: { memory: wasmmem }
        })
        const apis = instance.exports as WasmCoreApis
        expect(apis.malloc).toBeTypeOf("function")
        expect(apis.calloc).toBeTypeOf("function")
        expect(apis.realloc).toBeTypeOf("function")
        expect(apis.free).toBeTypeOf("function")
    })
})