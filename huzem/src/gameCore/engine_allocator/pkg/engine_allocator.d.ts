/* tslint:disable */
/* eslint-disable */
/**
*/
export function wasm_check(): void;
/**
* @param {number} size
* @param {number} align
* @returns {number}
*/
export function malloc(size: number, align: number): number;
/**
* @param {number} size
* @param {number} align
* @returns {number}
*/
export function calloc(size: number, align: number): number;
/**
* @param {number} ptr
* @param {number} size
* @param {number} align
*/
export function free(ptr: number, size: number, align: number): void;
/**
* @param {number} ptr
* @param {number} old_size
* @param {number} old_align
* @param {number} new_size
* @returns {number}
*/
export function realloc(ptr: number, old_size: number, old_align: number, new_size: number): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly wasm_check: () => void;
  readonly malloc: (a: number, b: number) => number;
  readonly calloc: (a: number, b: number) => number;
  readonly free: (a: number, b: number, c: number) => void;
  readonly realloc: (a: number, b: number, c: number, d: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
