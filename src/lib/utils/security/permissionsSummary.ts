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

const isValidWebRequestValue = (value: string) => {
    if (isDangerousCspOrigin(value)) {
        return false
    }
    try {
        return !!(new URL(value))
    } catch {
        return false
    }
}

export const cleanPermissions = (permissions: GeneralPermissions) => {
    const candidates = permissions as PermissionsList<Permissions>
    const cleaned = [] as GeneralPermissions
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]
        const {key, value} = candidate
        if (!(key in permissionsMeta)) {
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
        const isHttp = key === "webRequest"
        for (let x = 0; x < value.length; x++) {
            const v = value[x]
            if (duplicates.has(v)) {
                continue
            }
            if (isHttp && !isValidWebRequestValue(v)) {
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