import {Permissions, PermissionKeys, ALLOW_ALL_PERMISSIONS} from "../../types/permissions"
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
        files: startValue,
        embedExtensions: allowAll ? [ALLOW_ALL_PERMISSIONS] : [],
        webRequest: allowAll ? [ALLOW_ALL_PERMISSIONS] : [],
    } satisfies Record<PermissionKeys, unknown>
    return cleanedPermissions
}

const ENCODED_DOUBLE_QUOTES = encodeURIComponent('"')

export const isCspHttpValueDangerous = (cspValue: string) => {
    if (
        !cspValue.startsWith("http://") 
        && !cspValue.startsWith("https://")
    ) {
        return true
    }
    if (
        cspValue.includes("'") 
        || cspValue.includes("*")
        || cspValue.includes('"') 
        || cspValue.includes(ENCODED_DOUBLE_QUOTES)
    ) {
        return true
    }
    const split = cspValue.split(".")
    if (split.length < 2) {
        return true
    }
    return false
}

export const generateIframePolicy = (
    permissions: PermissionsList<Permissions>
) => {
    const summary = permissionsSummary(false)
    for (let i = 0; i < permissions.length; i++) {
        const {key, value} = permissions[i]
        switch (key) {
            case ALLOW_ALL_PERMISSIONS:
                return permissionsSummary(true)
            case "webRequest":
                if (value.includes(ALLOW_ALL_PERMISSIONS)) {
                    summary.webRequest = [ALLOW_ALL_PERMISSIONS]
                } else {
                    summary.webRequest = value.filter(
                        (val) => !isCspHttpValueDangerous(val)
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

export type PermissionsSummary = ReturnType<typeof generateIframePolicy>

export const hasUnsafePermissions = (summary: PermissionsSummary) => {
    return (
        summary.allowAll
        || (summary.embedExtensions.length > 0 && summary.embedExtensions[0] === ALLOW_ALL_PERMISSIONS)
        || (summary.webRequest.length > 0 && summary.webRequest[0] === ALLOW_ALL_PERMISSIONS)
    )
}