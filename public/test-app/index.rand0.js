export const pkg = {}

console.log("[🐢 app-shell]: got root element")

await import(window.location.origin + "/local/core/apps/2/index.rand2.mjs")