import wasmSupport from "wasm-check"

export const featureCheck = () => {
    return [
      {name: "service-worker", supported: ('serviceWorker' in navigator)},
      {name: "background-fetch", supported: ("BackgroundFetchManager" in self)},
      {name: "storage-estimate", supported: typeof navigator?.storage?.estimate !== "undefined"},
      {name: "shared-array-buffer", supported: typeof SharedArrayBuffer !== "undefined"},
      {name: "multiple-cores", supported: navigator.hardwareConcurrency > 1, hardwareRelated: true},
      {name: "web-assembly-v1", supported: wasmSupport.support(1)},
      {name: "web-assembly-simd", supported: wasmSupport.feature.simd},
    ] as const
}