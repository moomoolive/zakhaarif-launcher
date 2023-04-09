export type ConsoleCommand = (input: object) => unknown

export type ConsoleCommandIndex = Record<string, ConsoleCommand>

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement
    getDeltaTime: () => number
    getOriginTime: () => number
    getPreviousFrameTime: () => number
    getTotalElapsedTime: () => number
    isMainThread: () => boolean
    threadId: () => number
    zconsole: Record<string, ConsoleCommand>
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
    wasmHeap: Allocator
}

export type InitializedEngineCore = (
    EngineCore 
    & PostInitializationCore
)
