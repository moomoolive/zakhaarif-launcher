import wasm from "wasm-check"

const feature = (name: string, supported: boolean, hardwareRelated = false) => {
  return {name, supported, hardwareRelated}
}

export const featureCheck = () => {
  return [
    feature("service-worker", ('serviceWorker' in navigator)),
    feature("background-fetch", ("BackgroundFetchManager" in self)),
    feature("storage-estimate", typeof navigator?.storage?.estimate !== "undefined"),
    feature("shared-array-buffer", typeof SharedArrayBuffer !== "undefined"),
    feature("multiple-cores", navigator.hardwareConcurrency > 1, true),
    feature("web-assembly-v1", wasm.support(1)),
    feature("web-assembly-simd", wasm.feature.simd),
  ] as const
}