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

export interface MetaUtilities {
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

export type CssStatuses = (
    "ok"
    | "DOM_not_found"
)

export type CssUtilityLibrary = Readonly<{
    addGlobalSheet: (
        url: string, 
        attributes?: [key: string, value: string][]
    ) => {code: CssStatuses, sheet: HTMLElement | null}
}>

export type EngineCore = {
    getRootCanvas: () => HTMLCanvasElement | null
    getDeltaTime: () => number
    getOriginTime: () => number
    getPreviousFrameTime: () => number
    getTotalElapsedTime: () => number
    isMainThread: () => boolean
    threadId: () => number
    console: Record<string, ConsoleCommand>
    readonly meta: MetaUtilities
    readonly css: CssUtilityLibrary
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
