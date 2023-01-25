const permissions = [
    "*",
    "webRequest",
    "geolocation",
    "unlimitedStorage",
    {key: "files", value: ["read"]},
    {key: "gameSaves", value: ["read", "write"]},
    {key: "embedExtensions", value: [] as ("*" | string & {})[]}
] as const

export type Permissions = typeof permissions
