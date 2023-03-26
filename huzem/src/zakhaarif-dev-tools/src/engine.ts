export type TimeUtils = {
    originTime: () => number
    previousFrameTime: () => number
    totalElapsedTime: () => number
}

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement
    getDeltaTime: () => number
    readonly time: TimeUtils
}

export interface Allocator {
    getRawMemory: () => WebAssembly.Memory
    malloc: (byteSize: number, alignment: number) => number
    calloc: (byteSize: number, alignment: number) => number
    realloc: (
        ptr: number, 
        oldByteSize: number, 
        oldAlignment: number, 
        newByteSize: number
    ) => number
    free: (ptr: number, byteSize: number, alignment: number) => void
}

export type PostInitializationCore = {
    heap: Allocator
}

export type InitializedEngineCore = (
    EngineCore 
    & PostInitializationCore
)
