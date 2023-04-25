import type {ComponentDefinition} from "./components"

export type ConsoleCommand = (input: object) => unknown

export type ConsoleCommandIndex = {
    readonly [key: string]: ConsoleCommand
}

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

export type MetaUtilityLibrary = Readonly<{
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
}>

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

export type ParellelThreadIds = ReadonlyArray<0 | 1 | 2 | 3>

export type ParellelThreadId = ParellelThreadIds[number]

export type ThreadUtilityLibrary = Readonly<{
    isMainThread: () => boolean
    isWorkerThread: () => boolean
    currentThreadId: () => number
    mainThreadId: () => number
    count: () => ParellelThreadIds
}>

export type EngineStandardLibrary = Readonly<{
    /** A collection of helpers for creating/managing CSS style sheets */
    css: CssUtilityLibrary
    /** A collection of helpers for thread concurrency */
    thread: ThreadUtilityLibrary 
}>

export type EngineCore = Readonly<{
    getRootCanvas: () => HTMLCanvasElement | null
    getRootDomElement: () => HTMLElement | null
    getDeltaTime: () => number
    getOriginTime: () => number
    getPreviousFrameTime: () => number
    getTotalElapsedTime: () => number
    
    console: ConsoleCommandIndex
    meta: MetaUtilityLibrary
    /** A collection of standard libraries that make common tasks and interacting with the engine easier */
    std: EngineStandardLibrary
    wasmHeap: Allocator
}>

export interface JsHeapRef {
    i32: Int32Array
    f32: Float32Array
    u32: Uint32Array
    v: DataView
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
    jsHeap: () => Readonly<JsHeapRef>
}
