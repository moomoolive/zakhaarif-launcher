/** @type {import("./shabah/types").ShabahCliConfig} */
export const config = {
    generateMiniCargo: true,
    buildDir: "dist",
    ignore: [
        "test-app", 
        "test-game",
        "large-assets",
        "dev-sw.js",
        "sw.js",
        "build-manifest.json"
    ],
}