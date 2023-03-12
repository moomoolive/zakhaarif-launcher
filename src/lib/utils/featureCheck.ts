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
	feature("service-worker", "serviceWorker" in navigator),
	feature("shared-array-buffer", typeof SharedArrayBuffer !== "undefined"),
	feature("multiple-cores", navigator.hardwareConcurrency > 1, true),
	feature("web-assembly-v1", wasmCheck.support(1)),
	// simd-wasm is the most recent requirement for the app.
	// The app SHOULD be able to work on
	// safari >= 16.4, chromium >= 91, firefox >= 89,
	// both mobile & desktop distributions.
	feature("web-assembly-simd", wasmCheck.feature.simd),
] as const