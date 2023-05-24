import {expect, it, describe} from "vitest"
import fs from "fs/promises"
import path from 'path'
import { fileURLToPath } from 'url'
import {WasmCoreApis, createWasmMemory} from "./coreTypes"

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const WASM_PATH = "../../engine_wasm_core/pkg/engine_wasm_core_bg.wasm"

const getWasmModule = async () => {
    const fullpath = path.join(__dirname, WASM_PATH)
    const bytes = new Uint8Array((await fs.readFile(fullpath)).buffer)
    return new WebAssembly.Module(bytes)
}

const wasmmod = await getWasmModule()
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