import fs from "fs/promises"
import path from "path"
import {fileURLToPath} from "url"
import {WasmCoreFfi, createWasmMemory, ffiCore} from "./wasm/coreTypes"
import {MainEngine} from "./mainThreadEngine/core"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

const WASM_PATH = "../engine_wasm_core/pkg/engine_wasm_core_bg.wasm"

export async function coreWasmModule(): Promise<WebAssembly.Module> {
	const fullpath = path.join(__dirname, WASM_PATH)
	const bytes = new Uint8Array((await fs.readFile(fullpath)).buffer)
	return new WebAssembly.Module(bytes)
}

export async function initWasmCore(): Promise<{
    wasmMemory: WebAssembly.Memory
    coreBinary: WebAssembly.Module
    coreInstance: WebAssembly.Instance
	ffi: WasmCoreFfi
}> {
	const coreBinary = await coreWasmModule()
	const wasmMemory = createWasmMemory()
	const ffi = ffiCore({wasmMemory})
	return {
		wasmMemory,
		coreBinary,
		coreInstance: new WebAssembly.Instance(coreBinary, ffi),
		ffi
	}
}

export function initEngine(
	core: Awaited<ReturnType<typeof initWasmCore>>,
	{threadedMode = false} = {}
): MainEngine {
	return new MainEngine({
		rootCanvas: null,
		rootElement: null,
		threadedMode,
		...core
	})
}
