export declare const ALLOW_ALL_PERMISSIONS = "allowAll";
export type AllowAllPermissions = typeof ALLOW_ALL_PERMISSIONS;
export type ExtendablePermission = typeof ALLOW_ALL_PERMISSIONS | string & {};
export type AllPermissions = [
    AllowAllPermissions,
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
    {
        key: "files";
        value: ("read")[];
    },
    {
        key: "gameSaves";
        value: ("read" | "write")[];
    },
    {
        key: "embedExtensions";
        value: ExtendablePermission[];
    },
    {
        key: "webRequest";
        value: ExtendablePermission[];
    }
];
