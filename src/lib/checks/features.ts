import {isIframe} from "./index"

export const featureCheck = () => {
    if (isIframe()) {
      const supported = false
      return [
        {name: "service-worker", supported},
        {name: "background-fetch", supported},
        {name: "storage-estimate", supported},
        {name: "shared-array-buffer", supported},
        {name: "multiple-cores", supported},
        {name: "all-supported", supported},
      ] as const
    }
    const sw = ('serviceWorker' in navigator)
    const bgfetch = ("BackgroundFetchManager" in self)
    const storageQuery = typeof navigator?.storage?.estimate !== "undefined"
    const sharedBuffer = typeof SharedArrayBuffer !== "undefined"
    const multipleCpuCores = navigator.hardwareConcurrency > 1
    return [
      {name: "service-worker", supported: sw},
      {name: "background-fetch", supported: bgfetch},
      {name: "storage-estimate", supported: storageQuery},
      {name: "shared-array-buffer", supported: sharedBuffer},
      {name: "multiple-cores", supported: multipleCpuCores},
      {name: "all-supported", supported: sw && bgfetch && sharedBuffer && storageQuery && multipleCpuCores}
    ] as const
  }