// docs: https://github.com/moomoolive/huzma
/** @type {import("zakhaarif-dev-tools").HuzmaConfig} */
export default {
    buildDir: "dist/huzem/standardMod",
    outFile: "dist/huzem/standardMod/stable.huzma.json",
    ignore: [
        "build-manifest",
        "**/*.map"
    ],

    name: "Standard-mod",
    version: "0.1.0",
    entry: "index.mjs",
    authors: [{name: "Mostafa Elbannan"}],
    description: "The one mod to rule them all. No seriously, the game needs this mod to function as it provides all the game's core code.",
    license: "AGPL-3",
    homepageUrl: "https://github.com/moomoolive/zakhaarif-launcher",
    repo: {type: "git", url: "https://github.com/moomoolive/zakhaarif-launcher"},
    permissions: [
        "unlimitedStorage",
        {key: "files", value: ["read"]},
        {
            key: "webRequest", 
            value: ["https://unpkg.com/babylonjs-inspector@5.38.0/"]
        }
    ]
}