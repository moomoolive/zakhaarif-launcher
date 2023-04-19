let imports = {};
imports['__wbindgen_placeholder__'] = module.exports;
let wasm;
const { TextDecoder } = require(`util`);

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
/**
*/
module.exports.wasm_check = function() {
    wasm.wasm_check();
};

/**
* @param {number} size
* @param {number} align
* @returns {number}
*/
module.exports.malloc = function(size, align) {
    const ret = wasm.malloc(size, align);
    return ret;
};

/**
* @param {number} size
* @param {number} align
* @returns {number}
*/
module.exports.calloc = function(size, align) {
    const ret = wasm.calloc(size, align);
    return ret;
};

/**
* @param {number} ptr
* @param {number} size
* @param {number} align
*/
module.exports.free = function(ptr, size, align) {
    wasm.free(ptr, size, align);
};

/**
* @param {number} ptr
* @param {number} old_size
* @param {number} old_align
* @param {number} new_size
* @returns {number}
*/
module.exports.realloc = function(ptr, old_size, old_align, new_size) {
    const ret = wasm.realloc(ptr, old_size, old_align, new_size);
    return ret;
};

module.exports.__wbg_info_e45e081e3c9935f5 = function(arg0, arg1) {
    console.info(getStringFromWasm0(arg0, arg1));
};

const path = require('path').join(__dirname, 'engine_allocator_bg.wasm');
const bytes = require('fs').readFileSync(path);

const wasmModule = new WebAssembly.Module(bytes);
const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
wasm = wasmInstance.exports;
module.exports.__wasm = wasm;

