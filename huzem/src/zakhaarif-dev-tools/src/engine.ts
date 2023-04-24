import type {ComponentDefinition} from "./components"

export type ConsoleCommand = (input: object) => unknown

export type ConsoleCommandIndex = Record<string, ConsoleCommand>

export type ComponentFieldMeta = {
    name: string,
    id: number
    offset: number
}

export type ComponentMetadata = Readonly<{
    def: ComponentDefinition
    fullname: string
    name: string
    sizeof: number
    fields: ReadonlyArray<ComponentFieldMeta>
}>

export interface MetaUtilitiyLibrary {
    /** 
     * Returns the semver string of a linked mod.
     * If mod with inputted name does not exist, returns
     * an empty string.
    */
    getModVersion: (modName: string) => string

    /**
     * Returns various metadata about component. Returns
     * null if component does not exist.
     * @param componentName the components full name meaning
     * the mod name, then an underscore, then the name of
     * the component (eg. zakhaarifStd_acceleration)
     * @returns 
     */
    getComponentMeta: (componentName: string) => ComponentMetadata | null
}

export type CssStatus = (
    "ok"
    | "DOM_not_found"
)

export type CssUtilityLibrary = Readonly<{
    addGlobalSheet: (
        url: string, 
        attributes?: Record<string, string>
    ) => {code: CssStatus, sheet: HTMLElement | null}
}>

export type ThreadUtilityLibrary = Readonly<{
    isMainThread: () => boolean
    isWorkerThread: () => boolean
    currentThreadId: () => number
    mainThreadId: () => number
    count: () => ReadonlyArray<0 | 1 | 2 | 3>
}>

export type EngineStandardLibrary = {
    /** A collection of helpers for creating/managing CSS style sheets */
    readonly css: CssUtilityLibrary
    /** A collection of helpers for thread concurrency */
    readonly thread: ThreadUtilityLibrary 
}

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement | null
    getRootDomElement: () => HTMLElement | null
    getDeltaTime: () => number
    getOriginTime: () => number
    getPreviousFrameTime: () => number
    getTotalElapsedTime: () => number
    console: Record<string, ConsoleCommand>
    readonly meta: MetaUtilitiyLibrary
    /** A collection of standard libraries that make common tasks and interacting with the engine easier */
    readonly std: EngineStandardLibrary
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
