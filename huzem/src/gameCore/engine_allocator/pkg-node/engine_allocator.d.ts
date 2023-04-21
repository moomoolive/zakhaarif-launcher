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

export const __wasm: { memory: WebAssembly.Memory }