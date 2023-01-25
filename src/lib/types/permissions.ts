import type {PermissionsList} from "../cargo/index"

const permissions = [
    "*",
    "geoLocation",
    "microphone",
    "camera",
    "unlimitedStorage",
    "fullScreen",
    "pointerLock",
    "displayCapture",
    {key: "files", value: ["read"]},
    {key: "embedExtensions", value: [] as ("*" | string & {})[]},
    {key: "webRequest", value: [] as ("*" | string & {})[]}
] as const

type PermissionKeys = PermissionsList<typeof permissions>[number]["key"]

type PermissionsMeta<P extends string> = {
    readonly [key in P]: Readonly<{
        name?: string
        dangerous?: boolean
        extendable?: boolean
    }>
}

export const permissionsMeta: PermissionsMeta<PermissionKeys> = {
    "*": {name: "Unrestricted", dangerous: true},
    webRequest: {dangerous: true, extendable: true},
    geoLocation: {name: "Location", dangerous: true},
    microphone: {dangerous: true},
    camera: {dangerous: true},
    unlimitedStorage: {},
    fullScreen: {},
    pointerLock: {name: "Hide Mouse"},
    displayCapture: {name: "Screen Record", dangerous: true},
    files: {name: "Read Files"},
    embedExtensions: {dangerous: true, extendable: true}
}

export type Permissions = typeof permissions
