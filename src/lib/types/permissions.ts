import type {PermissionsList} from "../cargo/index"

export const ALLOW_ALL_PERMISSIONS = "allowAll"

export type AllowAllPermissionsDirective = typeof ALLOW_ALL_PERMISSIONS

const permissions = [
    ALLOW_ALL_PERMISSIONS,
    // maybe later "web-share" permission may be added
    // allowing for this: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy/web-share
    "geoLocation",
    "microphone",
    "camera",
    "displayCapture",

    "fullScreen",
    "pointerLock",
    "allowInlineContent",
    "allowUnsafeEval",
    "allowDataUrls",
    "allowBlobs",
    
    "unlimitedStorage",

    {key: "files", value: ["read"]},
    {key: "embedExtensions", value: [] as (typeof ALLOW_ALL_PERMISSIONS | string & {})[]},
    {key: "webRequest", value: [] as (typeof ALLOW_ALL_PERMISSIONS | string & {})[]}
] as const

export type PermissionKeys = PermissionsList<typeof permissions>[number]["key"]

const createMeta = ({
    name = "",
    dangerous = false,
    extendable = false,
    implicit = false
} = {}) => ({
    name,
    dangerous,
    extendable,
    implicit
}) as const

type PermissionsMeta<P extends string> = {
    readonly [key in P]: ReturnType<typeof createMeta>
}

export const permissionsMeta: PermissionsMeta<PermissionKeys> = {
    allowAll: createMeta({name: "Unrestricted", dangerous: true}),
    webRequest: createMeta({dangerous: true, extendable: true}),
    geoLocation: createMeta({name: "Location", dangerous: true}),
    microphone: createMeta({dangerous: true}),
    camera: createMeta({dangerous: true}),
    unlimitedStorage: createMeta(),
    fullScreen: createMeta(),
    allowInlineContent: createMeta({implicit: true}),
    allowUnsafeEval: createMeta({implicit: true}),
    allowDataUrls: createMeta({implicit: true}),
    allowBlobs: createMeta({implicit: true}),
    pointerLock: createMeta({name: "Hide Mouse"}),
    displayCapture: createMeta({name: "Record Screen", dangerous: true}),
    files: createMeta({name: "Read Files"}),
    embedExtensions: createMeta({dangerous: true, extendable: true})
}

export type Permissions = typeof permissions
