import fs from "fs/promises"
import path from "path"
import {fileURLToPath} from "url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

const WASM_PATH = "../engine_wasm_core/pkg/engine_wasm_core_bg.wasm"

export async function coreWasmModule(): Promise<WebAssembly.Module> {
	const fullpath = path.join(__dirname, WASM_PATH)
	const bytes = new Uint8Array((await fs.readFile(fullpath)).buffer)
	return new WebAssembly.Module(bytes)
}
