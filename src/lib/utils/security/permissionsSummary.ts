import {
    Permissions, 
    PermissionKeys, 
    ALLOW_ALL_PERMISSIONS,
    permissionsMeta
} from "../../types/permissions"
import {PermissionsList} from "../../cargo/index"
import { CargoIndices } from "../../shabah/downloadClient"

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
        files: {read: startValue},
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

export type GeneralPermissions = {key: string, value: string[]}[]

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
                summary.files.read = value.includes("read")
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

export const hasRootLevelPermissions = (summary: PermissionsSummary) => {
    if (summary.allowAll) {
        return true
    }
    return (
        summary.embedExtensions.length > 0 
        && summary.embedExtensions[0] === ALLOW_ALL_PERMISSIONS
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
    },
    files: (value: string) => {
        if (value === "read") {
            return true
        }
        return false
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
        if (value.length < 1 || permissionsMeta[key].booleanFlag) {
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
            case "files":
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

const cspKeywords = {
    "none": true,
    "self": true,
    "strict-dynamic": true,
    "unsafe-inline": true,
    "unsafe-eval": true,
    "unsafe-hashes": true,
    "report-sample": true,
} as const

export type ContentSecurityPolicyKeyword = (
    keyof typeof cspKeywords | string & {}
)

const addQuoteToKeyword = (keyword: ContentSecurityPolicyKeyword) => {
    if (keyword in cspKeywords) {
        return `'${keyword}'`
    }
    return keyword
}

export type ContentSecurityPolicyConfig = {
    iframeSource?: ContentSecurityPolicyKeyword[]
    workerSource?: ContentSecurityPolicyKeyword[]
    hostOrigin?: string,
    cargoOrigin?: string,
    allowRequestsToHostOrigin?: boolean
}

export const CSP_CONSTANT_POLICY = "object-src 'none';manifest-src 'none';base-uri 'none';"

export const UNSAFE_INLINE_CSP = "'unsafe-inline'"
export const UNSAFE_EVAL_CSP = "'unsafe-eval'"
export const UNSAFE_DATA_URLS_CSP = "data:"
export const UNSAFE_BLOBS_CSP = "blob:"
export const ALLOW_ALL_ORIGINS_CSP = "*"
export const SAME_ORIGIN_CSP_KEYWORD = "'self'"
export const REQUIRED_DEFAULT_SRC_CSP = SAME_ORIGIN_CSP_KEYWORD

export const createContentSecurityPolicy = (
    permissions: PermissionsSummary,
    config: ContentSecurityPolicyConfig
) => {
    if (
        permissions.allowAll 
        || (permissions.webRequest.length > 0 && permissions.webRequest[0] === ALLOW_ALL_PERMISSIONS)
    ) {
        return `default-src ${ALLOW_ALL_ORIGINS_CSP};${CSP_CONSTANT_POLICY}`
    }
    const {
        iframeSource = ["none"],
        workerSource = ["none"],
        hostOrigin = "",
        allowRequestsToHostOrigin = false,
        cargoOrigin = ""
    } = config
    const iframe = iframeSource.reduce((total, next) => `${total} ${addQuoteToKeyword(next)}`, "")
    const worker = workerSource.reduce((total, next) => `${total} ${addQuoteToKeyword(next)}`, "")
    const intialOrigins = [...permissions.webRequest]
    if (allowRequestsToHostOrigin && hostOrigin.length > 0) {
        intialOrigins.push(hostOrigin)
    }
    if (cargoOrigin.length > 0) {
        intialOrigins.push(cargoOrigin)
    }
    const originMap = new Map<string, number>()
    const allowedOrigins = intialOrigins.filter((origin) => {
        if (originMap.has(origin)) {
            return false
        }
        originMap.set(origin, 1)
        return true
    })

    let unsafeDirectives = []
    if (permissions.allowInlineContent) {
        unsafeDirectives.push(UNSAFE_INLINE_CSP)
    }
    if (permissions.allowUnsafeEval) {
        unsafeDirectives.push(UNSAFE_EVAL_CSP)
    }
    if (permissions.allowDataUrls) {
        unsafeDirectives.push(UNSAFE_DATA_URLS_CSP)
    }
    if (permissions.allowBlobs) {
        unsafeDirectives.push(UNSAFE_BLOBS_CSP)
    }
    return `default-src ${REQUIRED_DEFAULT_SRC_CSP}${unsafeDirectives.length > 0 ? " " + unsafeDirectives.join(" ") : ""}${allowedOrigins.length > 0 ? " " + allowedOrigins.join(" ") : ""};frame-src ${iframe};worker-src ${worker};${CSP_CONSTANT_POLICY}`
}

export const iframeAllowlist = (permissions: PermissionsSummary) => {
    let allowList = []
    if (permissions.camera) {
        allowList.push(`camera ${SAME_ORIGIN_CSP_KEYWORD};`)
    }
    if (permissions.displayCapture) {
        allowList.push(`display-capture ${SAME_ORIGIN_CSP_KEYWORD};`)
    }
    if (permissions.microphone) {
        allowList.push(`microphone ${SAME_ORIGIN_CSP_KEYWORD};`)
    }
    if (permissions.geoLocation) {
        allowList.push(`geolocation ${SAME_ORIGIN_CSP_KEYWORD};`)
    }
    if (permissions.fullScreen) {
        allowList.push(`fullscreen ${SAME_ORIGIN_CSP_KEYWORD};`)
    }
    return allowList.join(" ")
}

export const REQUIRED_SANDBOX_ATTRIBUTES = "allow-scripts allow-same-origin"

export const iframeSandbox = (permissions: PermissionsSummary) => {
    const base = REQUIRED_SANDBOX_ATTRIBUTES
    if (permissions.pointerLock) {
        return base + " allow-pointer-lock"
    }
    return base
}

export const mergePermissionSummaries = (
    originalPermissions: PermissionsSummary,
    cargoIndexes: CargoIndices
) => {
    if (
        originalPermissions.embedExtensions.length < 1
        || originalPermissions.embedExtensions[0] === ALLOW_ALL_PERMISSIONS
    ) {
        return originalPermissions
    }

    const canonicalUrlMap = new Map<string, number>()
    for (let i = 0; i < originalPermissions.embedExtensions.length; i++) {
        const embed = originalPermissions.embedExtensions[i]
        canonicalUrlMap.set(embed, 1)
    }
    const targetPermissions = []
    for (let i = 0; i < cargoIndexes.cargos.length; i++) {
        const cargo = cargoIndexes.cargos[i]
        if (!canonicalUrlMap.has(cargo.canonicalUrl)) {
            continue
        }
        const summary = generatePermissionsSummary(
            cargo.permissions
        )
        // a cargo that is embedding other cargos
        // cannot embed cargos with unsafe permissions
        if (hasUnsafePermissions(summary)) {
            continue
        }
        summary.webRequest.push(cargo.resolvedUrl)
        targetPermissions.push(summary)
    }
    if (targetPermissions.length < 1) {
        return originalPermissions
    }
    const merged: PermissionsSummary = JSON.parse(JSON.stringify(originalPermissions))
    merged.embedExtensions = []
    const unrestrictedHttp = (
        originalPermissions.webRequest.length > 0 
        && originalPermissions.webRequest[0] === ALLOW_ALL_PERMISSIONS
    )
    const httpMap = new Map<string, boolean>(
        unrestrictedHttp ? [] : merged.webRequest.map(
            (url) => [url, true] as const
        )
    )
    for (let i = 0; i < targetPermissions.length; i++) {
        // wow, this is cancerous
        const target = targetPermissions[i]
        merged.fullScreen ||= target.fullScreen
        merged.pointerLock ||= target.pointerLock
        merged.displayCapture ||= target.displayCapture
        merged.camera ||= target.camera
        merged.geoLocation ||= target.geoLocation
        merged.microphone ||= target.microphone
        merged.unlimitedStorage ||= target.unlimitedStorage
        merged.allowInlineContent ||= target.allowInlineContent
        merged.allowUnsafeEval ||= target.allowUnsafeEval
        merged.allowDataUrls ||= target.allowDataUrls
        merged.allowBlobs ||= target.allowBlobs
        merged.files ||= target.files
        merged.gameSaves.read ||= target.gameSaves.read
        merged.gameSaves.write ||= target.gameSaves.write
        if (unrestrictedHttp) {
            continue
        }
        for (let x = 0; x < target.webRequest.length; x++) {
            const url = target.webRequest[x]
            if (httpMap.has(url)) {
                continue
            }
            merged.webRequest.push(url)
            httpMap.set(url, true)
        }
    }

    if (unrestrictedHttp) {
        merged.webRequest = [ALLOW_ALL_PERMISSIONS]
    }

    return merged
}