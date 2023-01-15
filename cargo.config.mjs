/** @type {import("./src/lib/cargo/cliTypes").CargoCliConfig} */
export const config = {
    generateMiniCargo: true,
    buildDir: "dist",
    ignore: [
        "bg-fetch-test",
        "large-assets",
        "dev-sw.compiled.js",
        "sw.compiled.js",
        "build-manifest.json"
    ],
}