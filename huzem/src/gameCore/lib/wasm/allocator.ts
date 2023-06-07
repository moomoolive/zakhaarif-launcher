import type {
	MainThreadEngineCore,
	JsHeapRef
} from "zakhaarif-dev-tools"

type Allocator = MainThreadEngineCore["wasmHeap"]

type MallocAllocatorFn = Allocator["unsafeMalloc"]
type CallocAllocatorFn = Allocator["unsafeCalloc"]
type ReallocAllocatorFn = Allocator["unsafeRealloc"]
type FreeAllocatorFn = Allocator["unsafeFree"]

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
	jsHeapRef: JsHeapRef
	
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
	
	rawMemory(): WebAssembly.Memory {
		return this.wasmMemory
	}

	jsHeap(): Readonly<JsHeapRef> {
		return this.jsHeapRef
	}
}