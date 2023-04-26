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
     * @param componentName the component's full name meaning
     * the mod name followed by an underscore, then the name of
     * the component (eg. zakhaarifStd_acceleration)
     * @returns 
     */
    getComponentMeta: (componentName: string) => ComponentMetadata | null
}>

export type DomCode = (
    "ok"
    | "DOM_not_found"
)

export type DomStatus = Readonly<{
    code: DomCode, 
    sheet: HTMLElement | null
}>

export type CssUtilityLibrary = Readonly<{
    /** adds a css style sheet from a given url to current document */
    addGlobalSheet: (url: string,  attributes?: Record<string, string>) => DomStatus
}>

export type ThreadLibCore = Readonly<{
    isMainThread: () => boolean
    isWorkerThread: () => boolean
    currentThreadId: () => number
    mainThreadId: () => number
    osthreads: () => number
}>

export type ParellelThreadIds = ReadonlyArray<0 | 1 | 2 | 3>

export type ParellelThreadId = ParellelThreadIds[number]

export type ThreadUtilityLibrary = ThreadLibCore & Readonly<{
    syncthreads: () => ParellelThreadIds
}>

export type DomUtilityLibrary = Readonly<{
    /** 
     * returns the canvas which game display is being rendered 
     * on, returns null in Node environment 
     * */
    rootCanvas: () => HTMLCanvasElement | null
    /** 
     * returns the dom element which game canvas is attached to, 
     * returns null in Node environment 
     * */
    rootElement: () => HTMLElement | null
}>

export type TimeUtilityLibrary = Readonly<{
    /**
     * returns the amount of time that has passed since last
     * frame in milliseconds. Number is a 64-bit float (f64 or double)
     */
    deltaTime: () => number
    originTime: () => number
    previousFrame: () => number
    totalElapsedTime: () => number
}>

export type MainThreadStandardLibrary = Readonly<{
    /** A collection of helpers for creating/managing CSS style sheets */
    css: CssUtilityLibrary
    /** A collection of helpers for thread concurrency */
    thread: ThreadUtilityLibrary 
    /** A collection of helpers for interacting with dom elements related to engine */
    dom: DomUtilityLibrary
    /** A collection of helpers for dealing with game clock and general time */
    time: TimeUtilityLibrary
}>

export type MainThreadEngineCore = Readonly<{
    meta: MetaUtilityLibrary
    /** A collection of standard libraries that make common tasks and interacting with the engine easier */
    std: MainThreadStandardLibrary
    unsafeWasmHeap: Readonly<Allocator>
}>

export interface JsHeapRef {
    i32: Int32Array
    f32: Float32Array
    u32: Uint32Array
    f64: Float64Array
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
