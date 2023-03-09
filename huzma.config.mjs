// docs: https://github.com/moomoolive/huzma
/** @type {import("huzma").HuzmaCliConfig} */
export default {
    buildDir: "dist",
    huzmaName: "stable.huzma.json",
    license: "AGPL-3",
    ignore: [
        "example-pkgs/",
        "bg-fetch-test/",
        "test-game/",
        "test-std-mod/",
        "huzem/",
        "sandbox/",

        "_headers",
        "index.html",
        "build-manifest.json",

        "**/*.compiled.*",
        "**/*.map"
    ],
}