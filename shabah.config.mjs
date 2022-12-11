/** @type {import("./shabah/types").ShabahCliConfig} */
export const config = {
    generateMiniCargo: true,
    buildDir: "dist",
    ignore: [
        "test-app", 
        "test-game", 
        "dev-sw.js",
        "sw.js"
    ],
    fillMissingFieldsFromPackageJson: true
}