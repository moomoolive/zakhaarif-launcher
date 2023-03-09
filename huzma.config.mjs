// docs: https://github.com/moomoolive/huzma
/** @type {import("zakhaarif-dev-tools").HuzmaConfig} */
export default {
    buildDir: "dist",
    huzmaName: "stable.huzma.json",
    license: "AGPL-3",
    permissions: ["allowAll"],
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