import type {Allocator, JsHeapRef} from "zakhaarif-dev-tools"

export type HeapConfig = {
    malloc: Allocator["malloc"]
    calloc: Allocator["calloc"]
    free: Allocator["free"]
    realloc: Allocator["realloc"]
    memory: WebAssembly.Memory
}

export class WasmHeap implements Allocator {
	malloc: Allocator["malloc"]
	calloc: Allocator["calloc"]
	free: Allocator["free"]
	realloc: Allocator["realloc"]
	jsHeapRef: JsHeapRef
	
	private wasmMemory: WebAssembly.Memory

	constructor(config: HeapConfig) {
		this.wasmMemory = config.memory
		this.malloc = config.malloc
		this.calloc = config.calloc
		this.free = config.free
		this.realloc = config.realloc
		const buffer = config.memory.buffer
		this.jsHeapRef = {
			i32: new Int32Array(buffer),
			f32: new Float32Array(buffer),
			u32: new Uint32Array(buffer),
			f64: new Float64Array(buffer),
			v: new DataView(buffer)
		}
	}
	
	getRawMemory(): WebAssembly.Memory {
		return this.wasmMemory
	}

	jsHeap(): Readonly<JsHeapRef> {
		return this.jsHeapRef
	}
}