export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement;
};
export interface EngineExtensions {
}
export type ExtendedEngineCore = (EngineCore & EngineExtensions);
export type Ptr = number;
export interface Allocator {
    getRawMemory: () => WebAssembly.Memory;
    malloc: (byteSize: number) => Ptr;
    realloc: (ptr: Ptr, byteSize: number) => Ptr;
    free: (ptr: Ptr) => number;
}
export type PostInitializationCore = {
    allocator: Allocator;
};
export type InitializedEngineCore = (ExtendedEngineCore & PostInitializationCore);
