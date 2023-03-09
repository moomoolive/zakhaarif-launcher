// docs: https://github.com/moomoolive/huzma
/** @type {import("zakhaarif-dev-tools").HuzmaConfig} */
export default {
    buildDir: "public/huzem/standardMod",
    huzmaName: "stable.huzma.json",
    name: "standard-mod",
    entry: "index.mjs",
    ignore: [
        "build-manifest",
        "**/*.map"
    ]
}