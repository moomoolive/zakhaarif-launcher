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
    "unlimitedStorage",
    "fullScreen",
    "pointerLock",
    "displayCapture",
    "allowInlineContent",
    "allowUnsafeEval",
    {key: "files", value: ["read"]},
    {key: "embedExtensions", value: [] as (typeof ALLOW_ALL_PERMISSIONS | string & {})[]},
    {key: "webRequest", value: [] as (typeof ALLOW_ALL_PERMISSIONS | string & {})[]}
] as const

export type PermissionKeys = PermissionsList<typeof permissions>[number]["key"]

type PermissionsMeta<P extends string> = {
    readonly [key in P]: Readonly<{
        name?: string
        dangerous?: boolean
        extendable?: boolean
        implicit?: boolean
    }>
}

export const permissionsMeta: PermissionsMeta<PermissionKeys> = {
    allowAll: {name: "Unrestricted", dangerous: true},
    webRequest: {dangerous: true, extendable: true},
    geoLocation: {name: "Location", dangerous: true},
    microphone: {dangerous: true},
    camera: {dangerous: true},
    unlimitedStorage: {},
    fullScreen: {},
    allowInlineContent: {implicit: true},
    allowUnsafeEval: {implicit: true},
    pointerLock: {name: "Hide Mouse"},
    displayCapture: {name: "Screen Record", dangerous: true},
    files: {name: "Read Files"},
    embedExtensions: {dangerous: true, extendable: true}
}

export type Permissions = typeof permissions
