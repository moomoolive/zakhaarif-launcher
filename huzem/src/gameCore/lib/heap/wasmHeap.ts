import type {
	Allocator,
} from "zakhaarif-dev-tools"

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
	
	private wasmMemory: WebAssembly.Memory

	constructor(config: HeapConfig) {
		this.wasmMemory = config.memory
		this.malloc = config.malloc
		this.calloc = config.calloc
		this.free = config.free
		this.realloc = config.realloc
	}
	
	getRawMemory(): WebAssembly.Memory {
		return this.wasmMemory
	}
}