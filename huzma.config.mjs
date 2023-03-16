import {EXTENSION_METADATA} from "zakhaarif-dev-tools/extensions.js"

import "zakhaarif-dev-tools"

// docs: https://github.com/moomoolive/huzma
/** @type {import("zakhaarif-dev-tools").HuzmaConfig} */
export default {
    buildDir: "dist",
    huzmaName: "stable.huzma.json",
    name: "Launcher",
    license: "AGPL-3",
    permissions: ["allowAll"],
    ignore: [
        "example-pkgs/",
        "bg-fetch-test/",
        "test-game/",
        "test-std-mod/",
        "huzem/",
        "sandbox/",
        "large-assets/",

        "_headers",
        "index.html",
        "build-manifest.json",
        "asset-pack.json",

        "**/*.compiled.*",
        "**/*.map"
    ],
    metadata: {
        ...EXTENSION_METADATA
    }
}