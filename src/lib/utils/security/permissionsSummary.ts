import {
    Permissions, 
    PermissionKeys, 
    ALLOW_ALL_PERMISSIONS,
    permissionsMeta
} from "../../types/permissions"
import {PermissionsList} from "../../cargo/index"

const permissionsSummary = (allowAll: boolean) => {
    const startValue = allowAll
    const cleanedPermissions = {
        allowAll: startValue,
        fullScreen: startValue,
        pointerLock: startValue,
        displayCapture: startValue,
        camera: startValue,
        geoLocation: startValue,
        microphone: startValue,
        unlimitedStorage: startValue,
        allowInlineContent: startValue,
        allowUnsafeEval: startValue,
        allowDataUrls: startValue,
        allowBlobs: startValue,
        files: startValue,
        gameSaves: {read: startValue, write: startValue},
        embedExtensions: allowAll ? [ALLOW_ALL_PERMISSIONS] : [],
        webRequest: allowAll ? [ALLOW_ALL_PERMISSIONS] : [],
    } satisfies Record<PermissionKeys, unknown>
    return cleanedPermissions
}

export const isDangerousCspOrigin = (cspValue: string) => {
    if (
        !cspValue.startsWith("http://") 
        && !cspValue.startsWith("https://")
    ) {
        return true
    }
    if (cspValue.includes("*") || !cspValue.includes(".")) {
        return true
    }
    return false
}

type GeneralPermissions = {key: string, value: string[]}[]

export const generatePermissionsSummary = (
    permissions: GeneralPermissions
) => {
    const summary = permissionsSummary(false)
    for (let i = 0; i < permissions.length; i++) {
        const {key: k, value} = permissions[i]
        if (!(k in summary)) {
            continue
        }
        const key = k as PermissionsList<Permissions>[number]["key"]
        switch (key) {
            case ALLOW_ALL_PERMISSIONS:
                return permissionsSummary(true)
            case "webRequest":
                if (value.includes(ALLOW_ALL_PERMISSIONS)) {
                    summary.webRequest = [ALLOW_ALL_PERMISSIONS]
                } else {
                    summary.webRequest = value.filter(
                        (val) => !isDangerousCspOrigin(val)
                    )
                }
                break   
            case "embedExtensions":
                if (value.includes(ALLOW_ALL_PERMISSIONS)) {
                    summary.embedExtensions = [ALLOW_ALL_PERMISSIONS]
                } else {
                    summary.embedExtensions = value
                }
                break
            case "gameSaves":
                summary.gameSaves.read = value.includes("read")
                summary.gameSaves.write = value.includes("write")
                break
            case "files":
                if (value.includes("read")) {
                    summary.files = true
                }
                break
            default:
                summary[key] = true
                break
        }
    }
    return summary
}

export type PermissionsSummary = ReturnType<typeof generatePermissionsSummary>

export const hasUnsafePermissions = (summary: PermissionsSummary) => {
    return (
        summary.allowAll
        || summary.embedExtensions.length > 0
        || (summary.webRequest.length > 0 && summary.webRequest[0] === ALLOW_ALL_PERMISSIONS)
    )
}

const permissionCleaners = {
    webRequest: (value: string) => {
        if (isDangerousCspOrigin(value)) {
            return false
        }
        try {
            return !!(new URL(value))
        } catch {
            return false
        }
    },
    gameSaves: (value: string) => {
        switch (value) {
            case "read":
            case "write":
                return true
            default:
                return false
        }
    }
} as const

export const cleanPermissions = (permissions: GeneralPermissions) => {
    const candidates = permissions as PermissionsList<Permissions>
    const cleaned = [] as GeneralPermissions
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]
        const {key, value} = candidate
        if (
            !(key in permissionsMeta)
            || permissionsMeta[key].extendable && value.length < 1
            || permissionsMeta[key].fixedOptions && value.length < 1
        ) {
            continue
        }
        if (value.length < 1) {
            cleaned.push({key, value: []})
            continue
        }
        if ((value as string[]).includes(ALLOW_ALL_PERMISSIONS)) {
            cleaned.push({key, value: [ALLOW_ALL_PERMISSIONS]})
            continue
        }
        const duplicates = new Map<string, number>()
        const newValues = []
        let validator = null as (null | ((value: string) => boolean))
        switch (key) {
            case "webRequest":
            case "gameSaves":
                validator = permissionCleaners[key]
                break
            default:
                break
        }
        for (let x = 0; x < value.length; x++) {
            const v = value[x]
            if (duplicates.has(v)) {
                continue
            }
            if (validator && !validator(v)) {
                continue
            }
            newValues.push(v)
            duplicates.set(v, 1)
        }
        cleaned.push({key, value: newValues})
    }
    return cleaned as PermissionsList<Permissions>
}

export type CleanedPermissions = ReturnType<typeof cleanPermissions>