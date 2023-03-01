import wasmCheck from "wasm-check"

type FeatureCheck = {
    name: string
    supported: boolean
    hardwareRelated: boolean
}

const feature = (name: string, supported: boolean, hardwareRelated = false): FeatureCheck  => {
    return {name, supported, hardwareRelated}
}

export const FEATURE_CHECK = [
    feature("service-worker", 'serviceWorker' in navigator),
    feature("background-fetch", "BackgroundFetchManager" in self),
    feature("storage-estimate", typeof navigator?.storage?.estimate !== "undefined"),
    feature("shared-array-buffer", typeof SharedArrayBuffer !== "undefined"),
    feature("multiple-cores", navigator.hardwareConcurrency > 1, true),
    feature("web-assembly-v1", wasmCheck.support(1)),
    feature("web-assembly-simd", wasmCheck.feature.simd),
    feature("decompression-stream", "DecompressionStream" in window)
] as const