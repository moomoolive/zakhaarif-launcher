export type WasmCoreApis = typeof import("../../engine_wasm_core/pkg/engine_wasm_core_bg.wasm")

export function createWasmMemory(): WebAssembly.Memory {
	return new WebAssembly.Memory({
		initial: 18, maximum: 16384, shared: true
	})
}