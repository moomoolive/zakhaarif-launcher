if (window.top !== window.parent) {
    throw new Error("second-level embedding is disallowed")
}
if (window.self === window.top) {
    throw new Error("document must be embedded in iframe")
}
const root = document.getElementById("root-script")
await import(root?.getAttribute("entry") || "none")