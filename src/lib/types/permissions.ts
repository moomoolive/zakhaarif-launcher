import type {PermissionsList} from "huzma"
import {
    ALLOW_ALL_PERMISSIONS as allowAll,
    AllPermissions,
} from "../../../common/zakhaarif-dev-tools"

export const ALLOW_ALL_PERMISSIONS = allowAll
export const ALLOW_ALL_EMBEDS = ALLOW_ALL_PERMISSIONS
export const ALLOW_ALL_HTTP = ALLOW_ALL_PERMISSIONS

export type Permissions = AllPermissions
export type PermissionKeys = PermissionsList<AllPermissions>[number]["key"]

const createMeta = ({
    name = "",
    dangerous = false,
    extendable = false,
    implicit = false,
    fixedOptions = false,
    booleanFlag = false
} = {}) => ({
    name,
    dangerous,
    extendable,
    implicit,
    fixedOptions,
    booleanFlag
}) as const

export type PermissionMeta = ReturnType<typeof createMeta>

export const permissionsMeta = {
    // boolean permissions
    allowAll: createMeta({booleanFlag: true, name: "Unrestricted", dangerous: true}),
    geoLocation: createMeta({booleanFlag: true, name: "Location", dangerous: true}),
    microphone: createMeta({booleanFlag: true, dangerous: true}),
    camera: createMeta({booleanFlag: true, dangerous: true}),
    unlimitedStorage: createMeta({booleanFlag: true}),
    fullScreen: createMeta({booleanFlag: true}),
    allowInlineContent: createMeta({booleanFlag: true, implicit: true}),
    allowUnsafeEval: createMeta({booleanFlag: true, implicit: true}),
    allowDataUrls: createMeta({booleanFlag: true, implicit: true}),
    allowBlobs: createMeta({booleanFlag: true, implicit: true}),
    pointerLock: createMeta({booleanFlag: true, name: "Hide Mouse"}),
    displayCapture: createMeta({booleanFlag: true, name: "Record Screen", dangerous: true}),
    
    // fixed permissions
    files: createMeta({fixedOptions: true, name: "Read Files"}),
    gameSaves: createMeta({fixedOptions: true}),

    // extendable permissions
    embedExtensions: createMeta({extendable: true, dangerous: true}),
    webRequest: createMeta({extendable: true, dangerous: true}),
} as const satisfies Record<PermissionKeys, PermissionMeta>


