import type {
	Allocator,
	MallocAllocatorFn,
	CallocAllocatorFn,
	ReallocAllocatorFn,
	FreeAllocatorFn,
} from "zakhaarif-dev-tools"

export type JsWasmHeapView = {
    i32: Int32Array
    f32: Float32Array
    u32: Uint32Array
    f64: Float64Array
    v: DataView
}

export type WasmAllocatorConfig =  {
	malloc: MallocAllocatorFn
	calloc: CallocAllocatorFn
	realloc: ReallocAllocatorFn
	free: FreeAllocatorFn 
}

export class WasmAllocator implements Allocator {
	unsafeMalloc: MallocAllocatorFn
	unsafeCalloc: CallocAllocatorFn
	unsafeFree: FreeAllocatorFn
	unsafeRealloc: ReallocAllocatorFn
	jsHeapRef: JsWasmHeapView
	
	private wasmMemory: WebAssembly.Memory

	constructor(memory: WebAssembly.Memory, config: WasmAllocatorConfig) {
		this.wasmMemory = memory
		this.unsafeMalloc = config.malloc
		this.unsafeCalloc = config.calloc
		this.unsafeFree = config.free
		this.unsafeRealloc = config.realloc
		const {buffer} = memory
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

	jsHeap(): Readonly<JsWasmHeapView> {
		return this.jsHeapRef
	}
}