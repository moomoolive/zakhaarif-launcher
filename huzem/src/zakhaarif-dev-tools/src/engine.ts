export type TimeUtils = {
    originTime: () => number
    previousFrameTime: () => number
    totalElapsedTime: () => number
}

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement
    getDeltaTime: () => number
    time: TimeUtils
}

export type Ptr = number

export interface Allocator {
    getRawMemory: () => WebAssembly.Memory
    malloc: (byteSize: number) => Ptr
    realloc: (ptr: Ptr, byteSize: number) => Ptr
    free: (ptr: Ptr) => number
}

export type PostInitializationCore = {
    allocator: Allocator
}

export type InitializedEngineCore = (
    EngineCore 
    & PostInitializationCore
)
