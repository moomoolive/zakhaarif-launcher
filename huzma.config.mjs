/** @type {import("./prototype/cli/types").HuzmaCliConfig} */
export const config = {
    buildDir: "dist",
    ignore: [
        "example-pkgs",
        "bg-fetch-test",
        "test-game",
        "credits.json",
        "_headers",
        "sw.compiled.js",
        "dev-sw.compiled.js",
        //"/*.js.map/i",
        "test-game",
        "test-std-mod"
    ],
    huzmaName: "stable.huzma.json",
    license: "AGPL-3"
}