export const MANIFEST_NAME = "manifest.json"
export const APP_ENTRY = "index.js"
export const LAUCHER_CACHE = "launcher-v1"
export const APP_CACHE = "app-v1"
export const VIRTUAL_DRIVE = "local/"
export const CORE_FOLDER = VIRTUAL_DRIVE + "core/"
export const CURRENT_APP_DIR = CORE_FOLDER + "current-app/"
export const CURRENT_APP_MANIFEST = (
    CURRENT_APP_DIR + "current-manifest.json"
)
export const CURRENT_APP_ENTRY_PARAMS = (
    CURRENT_APP_DIR + "__entry__.json"
)
const PREVIOUS_APP_DIR = CORE_FOLDER + "/previous-app/"
export const PREVIOUS_APP_MANIFEST = (
    PREVIOUS_APP_DIR + "previous-manifest.json"
)
export const NO_EXPIRATION = -1
export const enum sources {
    launcher = 1
}
export const enum headers {
    insertedAt = "sw-inserted-at",
    expiration = "sw-expiration",
    source = "sw-source",
    origin = "sw-origin",
    content_length = "content-length"
}

export const enum dom_hooks {
    root_div = "root"
}