export const MANIFEST_NAME = "cargo.json"
export const APP_CACHE = "app-v1"
export const VIRTUAL_DRIVE = "local/"
export const CORE_FOLDER = VIRTUAL_DRIVE + "core/"
export const APP_RECORDS = CORE_FOLDER + "__entry__.json"
export const APPS_FOLDER = CORE_FOLDER + "apps/"

export const NO_EXPIRATION = -1

export const dom_hooks = {
    root_div: "root"
} as const

export const ALL_CRATE_VERSIONS = {
    "0.1.0": 1
} as const
export type CrateVersion = keyof typeof ALL_CRATE_VERSIONS
export type NullField = "none"
export const LATEST_CRATE_VERSION = "0.1.0"
export const NULL_FIELD = "none"
export const UUID_LENGTH = 35
export const reservedIds = {
    "std-app": "XRFCvi60nXcM0ZPiEupkeW9eNmoPi9ybk_S",
    "std": "nZgOO5v-13AccpgJoAAzz6YWrGhM2bNZg5s"
} as const
export type ReservedUuids = typeof reservedIds[keyof typeof reservedIds]
export type ReservedPackageNames = keyof typeof reservedIds