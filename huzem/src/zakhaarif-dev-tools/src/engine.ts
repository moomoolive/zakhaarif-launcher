import type {ComponentDefinition} from "./components"
import type {usize, OwnedReference} from "./primitives"

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

export type DomStatus = Readonly<{
    code: "ok" | "DOM_not_found", 
    sheet: HTMLElement | null
}>

export type StandardLib = (Readonly<{
    /** A collection of helpers for creating/managing CSS style sheets */
    css: Readonly<{
        /** adds a css style sheet from a given url to current document */
        addGlobalSheet: (url: string,  attributes?: Record<string, string>) => DomStatus
    }>
    /** A collection of helpers for interacting with dom elements related to engine */
    dom: Readonly<{
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
    /** A collection of helpers for dealing with game clock and general time */
    time: Readonly<{
        /**
         * returns the amount of time that has passed since last
         * frame in milliseconds. Number is a 64-bit float (f64 or double)
         */
        deltaTime: () => number
        originTime: () => number
        previousFrame: () => number
        totalElapsedTime: () => number
    }>
}> & (typeof import("./freeStandingStdLib"))["std"])

export interface JsHeapRef {
    i32: Int32Array
    f32: Float32Array
    u32: Uint32Array
    f64: Float64Array
    v: DataView
}

export type MainThreadEngineCore = Readonly<{
    meta: Readonly<{
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
    /** A standard libraries that makes common tasks and interacting with the engine easier */
    std: StandardLib
    /** A thread-safe heap allocator, backed by 
     * Web Assembly (WASM) memory (32-bit). This is where
     * all engine data structures and ECS components are
     * stored.
     * 
     * You probably SHOULDN'T use this unless you have
     * a good reason to. Many of the `wasmHeap` APIs are
     * unsafe and may corrupt engine memory
     * (__VERY BAD!__) if used incorrectly.
     * */
    wasmHeap: Readonly<{
        getRawMemory: () => WebAssembly.Memory
        /**  __UNSAFE!__ 
         * 
         * Allocates a given amount of bytes on heap and returns a 
         * pointer (u32). 
         * Returns a null pointer if allocation fails. 
         * Returns a valid pointer otherwise.
         * */
        unsafeMalloc: <T extends unknown = unknown>(
            byteSize: usize, 
            alignment: usize<1 | 2 | 4 | 8 | 16>
        ) => OwnedReference<T>
        /** 
         * __UNSAFE!__ 
         * 
         * Allocates a given amount of bytes on heap, sets all 
         * memory in range to zero, then returns a pointer (u32).
         * 
         * Differs from `unsafeMalloc` in that all pointed to memory
         * is guaranteed to be set to zero, therefore is slightly 
         * less  performant than `unsafeMalloc`.
         * Returns a null pointer if allocation fails. 
         * Returns a valid pointer otherwise.
         *  
         * */
        unsafeCalloc: <T extends unknown = unknown>(
            byteSize: usize, 
            alignment: usize<1 | 2 | 4 | 8 | 16>
        ) => OwnedReference<T>
        /**  __UNSAFE!__ 
         * 
         * Resizes a pointer (shrinks or enlarges) to a given size 
         * and then returns resized pointer (u32). 
         * 
         * This is equivalent to freeing (`unsafeFree`) a pointer
         * then creating a new pointer (`unsafeMalloc`) with new
         * size, but slightly more performant.
         * Returns a null pointer if the memory 
         * couldn’t be reallocated, but `ptr` is still valid.
         * */
        unsafeRealloc: <T extends unknown = unknown>(
            ptr: OwnedReference<T>, 
            oldByteSize: usize, 
            oldAlignment: usize<1 | 2 | 4 | 8 | 16>, 
            newByteSize: usize
        ) => OwnedReference<T>
        /**  __UNSAFE!__ 
         * 
         * Reclaims memory at pointer, so it can be reused by heap.
         * Do NOT attempt to free the same pointer twice as this may
         * lead to memory corruption. Also, do NOT free a pointer you
         * don't own. 
         * */
        unsafeFree: (
            ptr: OwnedReference, 
            byteSize: usize, 
            alignment: usize<1 | 2 | 4 | 8 | 16>
        ) => void
        /**
         * A view on top of allocator heap that allows javascript
         * to read & write directly to WASM memory.
         */
        jsHeap: () => Readonly<JsHeapRef>
    }>
}>

/** 
 * Based on Rust Lang's primitive alignment. All values
 * are in bytes.
 * 
 * https://doc.rust-lang.org/reference/type-layout.html 
 */
export type Align = Parameters<MainThreadEngineCore["wasmHeap"]["unsafeMalloc"]>[1]
