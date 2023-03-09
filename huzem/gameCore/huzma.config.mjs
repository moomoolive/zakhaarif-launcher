import {EXTENSION_METADATA} from "../../common/zakhaarif-dev-tools/build/index.js"

// docs: https://github.com/moomoolive/huzma
/** @type {import("zakhaarif-dev-tools").HuzmaConfig} */
export default {
    buildDir: "public/huzem/gameCore",
    huzmaName: "stable.huzma.json",
    name: "game-core",
    entry: "index.mjs",
    ignore: [
        "build-manifest",

        "**/*.map"
    ],
    metadata: {...EXTENSION_METADATA}
}