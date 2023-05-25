import {ALLOW_ALL_PERMISSIONS} from "./stdFullLib"

export type AllowAllPermissions = typeof ALLOW_ALL_PERMISSIONS

export type ExtendablePermission = typeof ALLOW_ALL_PERMISSIONS | string & {}

export type AllPermissions = [
    AllowAllPermissions,
    // "web-share" permission may be added later?
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

    {key: "files", value: ("read")[]},
    {key: "gameSaves", value: ("read" | "write")[]},
    {key: "embedExtensions", value: ExtendablePermission[]},
    {key: "webRequest", value: ExtendablePermission[]}
] 