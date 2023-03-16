export interface Ecs {
    addSystem: (system: () => void) => number
}

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement
    ecs: Ecs
    getDeltaTime: () => number
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
