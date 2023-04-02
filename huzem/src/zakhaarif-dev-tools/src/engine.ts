export type TimeUtils = {
    originTime: () => number
    previousFrameTime: () => number
    totalElapsedTime: () => number
}

export type ThreadUtils = {
    isMainThread: () => boolean
    threadId: () => number
}

export type ConsoleCommand = (input: object) => unknown

export type ConsoleCommandIndex = Record<string, ConsoleCommand>

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement
    getDeltaTime: () => number
    readonly time: TimeUtils
    readonly threads: ThreadUtils
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
