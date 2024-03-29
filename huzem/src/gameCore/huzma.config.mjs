// docs: https://github.com/moomoolive/huzma
/** @type {import("zakhaarif-dev-tools").HuzmaConfig} */
export default {
    buildDir: "dist/huzem/gameCore",
    outFile: "dist/huzem/gameCore/stable.huzma.json",
    ignore: [
        "build-manifest",
        "**/*.map"
    ],
    name: "game-core",
    entry: "index.mjs",
    version: "0.1.0",
    description: "Starts game loop and injects any linked mods",
    license: "AGPL-3",
    authors: [{name: "Mostafa Elbannan"}],
    homepageUrl: "https://github.com/moomoolive/zakhaarif-launcher",
    repo: {type: "git", url: "https://github.com/moomoolive/zakhaarif-launcher"},
    permissions: [
        "fullScreen",
        "pointerLock",
        "allowInlineContent",
        "allowUnsafeEval",
        "allowDataUrls",
        {key: "gameSaves", value: ["read", "write"]},
        {key: "embedExtensions", value: ["allowAll"]}
    ],
    metadata: {
        "is-extension": "true"
    },
}