import {MainEngine, EngineConfig} from "./core"
import initEngineApis from "../../engine_wasm_core/pkg/engine_wasm_core"
import {WasmAllocatorConfig, WasmAllocator} from "../wasm/allocator"
import {wasmMap} from "../../../wasmBinaryPaths.mjs"

type NodeEngineApis = typeof import("../../engine_wasm_core/pkg-node/engine_wasm_core.js")

export async function initEngine(
	config: Omit<EngineConfig, "wasmHeap">
): Promise<MainEngine> {
	const isRunningInNode = (
		typeof global !== "undefined"
        && typeof require === "function"
	)
	if (isRunningInNode) {
		const nodeEngineApis: NodeEngineApis = require("../../engine_wasm_core/pkg-node/engine_wasm_core.js") // eslint-disable-line @typescript-eslint/no-var-requires
        type NodeAllocatorApis = NodeEngineApis & WasmAllocatorConfig
        const allocConfig = {...nodeEngineApis, memory: nodeEngineApis.__wasm.memory} as NodeAllocatorApis
        const wasmHeap = new WasmAllocator(allocConfig)
        return new MainEngine({...config, wasmHeap})
	}
	const relativeUrl = wasmMap.engine_wasm_core
	const binaryUrl = new URL(relativeUrl, import.meta.url).href
	const webEngineApis = await initEngineApis(binaryUrl)
    type WebAlloctorApis = typeof webEngineApis & WasmAllocatorConfig
    const wasmHeap = new WasmAllocator(
        webEngineApis as WebAlloctorApis
    )
    return new MainEngine({wasmHeap, ...config})
}