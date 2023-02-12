import type {DeepReadonly} from "../types/utility"
import {Cargo} from "../cargo/index"
import {CargoIndex} from "../shabah/downloadClient"
import {ALLOW_ALL_PERMISSIONS, Permissions} from "../types/permissions"
import type {AppDatabase} from "../database/AppDatabase"
import {sleep} from "../utils/sleep"
import { APP_CACHE } from "../../config"
import {wRpc} from "../wRpc/simple"
import {nanoid} from "nanoid"
import {type as betterTypeof} from "../utils/betterTypeof"
import {PermissionsSummary} from "../utils/security/permissionsSummary"

export type SandboxDependencies = DeepReadonly<{
    displayExtensionFrame: () => void
    minimumLoadTime: number
    queryState: string
    createFatalErrorMessage: (msg: string) => void
    confirmExtensionExit: () => Promise<void>
    cargoIndex: CargoIndex
    cargo: Cargo<Permissions>
    recommendedStyleSheetUrl: string
    database: AppDatabase
}>

export type RpcPersistentState = {
    configuredPermissions: boolean
    setEmbedUrls: (canonicalUrls: string[]) => unknown
}

const MINIMUM_AUTH_TOKEN_LENGTH = 20
const AUTH_TOKEN_LENGTH = (() => {
    const additionalLength = Math.trunc(Math.random() * 20)
    return MINIMUM_AUTH_TOKEN_LENGTH + additionalLength
})()

export const createRpcState = (
    dependencies: SandboxDependencies, 
    persistentState: RpcPersistentState,
    permissionsSummary: PermissionsSummary
) => {
    const {minimumLoadTime} = dependencies
    const mutableState = {
        readyForDisplay: false,
        secureContextEstablished: false,
        minimumLoadTimePromise: sleep(minimumLoadTime),
        fatalErrorOccurred: false,
        permissionsSummary,
        authToken: nanoid(AUTH_TOKEN_LENGTH)
    }
    type SandboxMutableState = typeof mutableState
    type InitialState = (
        SandboxDependencies 
        & SandboxMutableState
        & {persistentState: RpcPersistentState}
    )
    return {...dependencies, ...mutableState, persistentState} as InitialState
}

export type RpcState = ReturnType<typeof createRpcState>

export const embedAnyExtensionRpcs = (state: RpcState) => {
    if (
        state.persistentState.configuredPermissions
        || state.permissionsSummary.embedExtensions.length < 1
        || state.permissionsSummary.embedExtensions[0] !== ALLOW_ALL_PERMISSIONS
    ) {
        return {} as typeof rpcs
    }
    
    const reconfigurePermissions = (parameters :{canonicalUrls: string[], authToken: string}) => {
        if (state.persistentState.configuredPermissions) {
            //console.warn("attempted to reconfigure permissions, but permissions are already configured")
            return false
        }
        if (
            typeof parameters !== "object"
            || parameters === null
            || typeof parameters.authToken !== "string"
            || !Array.isArray(parameters.canonicalUrls)
        ) {
            //console.warn("could not configure permissions because input is invalid. input =", parameters)
            return false
        }
        const {canonicalUrls, authToken} = parameters
        if (authToken !== state.authToken) {
            //console.warn("extension attempted to reconfigure permissions but provided wrong auth token")
            return false
        }
        const urls = canonicalUrls.filter((url) => typeof url === "string")
        state.persistentState.setEmbedUrls(urls)
        return true
    }

    const rpcs = {reconfigurePermissions} as const
    return rpcs
}

export const gameSaveRpcs = (state: RpcState) => {
    const {gameSaves: savePermissions} = state.permissionsSummary
    if (!savePermissions.read && !savePermissions.write) {
        return {} as typeof allPermissions
    }

    const getSaveFile = async (id: number) => {
        if (typeof id !== "number") {
            //console.warn(`extension token must be a number, got "${betterTypeof(id)}"`)
            return null
        }
        if (id < 0) {
            return await state.database.gameSaves.latest()
        }
        return await state.database.gameSaves.getById(id)
    }

    // readonly permissions
    if (!savePermissions.write) {
        return {getSaveFile} as unknown as typeof allPermissions
    }
    const createSave = () => 1
    // write only permissions
    if (!savePermissions.read) {
        return {createSave} as unknown as typeof allPermissions
    }

    // read & write permissions
    const allPermissions = {
        getSaveFile,
        createSave
    }
    return allPermissions
}

export const essentialRpcs = (state: RpcState) => {
    return {
        getFile: async (url: string) => {
            if (typeof url !== "string") {
                console.warn(`provided url was not a string, got "${betterTypeof(url)}"`)
                return null
            }
            const cache = await caches.open(APP_CACHE)
            const file = await cache.match(url)
            if (!file || !file.body) {
                return null
            }
            const type = file.headers.get("content-type") || "text/plain"
            const length = file.headers.get("content-length") || "0"
            const transfer = {type, length, body: file.body} as const
            return wRpc.transfer(transfer, [file.body])
        },
        getInitialState: () => {
            if (state.secureContextEstablished) {
                return null
            }
            const {queryState, authToken, cargoIndex} = state
            const {resolvedUrl} = cargoIndex
            const {recommendedStyleSheetUrl: rawCssExtension} = state
            const cssExtension = rawCssExtension.startsWith("https://") || rawCssExtension.startsWith("http://")
                ? rawCssExtension
                : rawCssExtension.startsWith("/") ? rawCssExtension.slice(1) : rawCssExtension
            const {configuredPermissions} = state.persistentState
            return {
                configuredPermissions,
                queryState, 
                authToken, 
                rootUrl: resolvedUrl,
                recommendedStyleSheetUrl: `${window.location.origin}/${cssExtension}`
            }
        },
        secureContextEstablished: () => {
            state.secureContextEstablished = true
            return true
        },
        signalFatalError: (extensionToken: string) => {
            if (typeof extensionToken !== "string") {
                console.warn(`extension token must be a string, got "${betterTypeof(extensionToken)}"`)
                return false
            }
            if (
                state.secureContextEstablished 
                && extensionToken !== state.authToken
            ) {
                console.warn("application signaled fatal error but provided wrong auth token")
                return false
            }
            state.fatalErrorOccurred = true
            console.log("extension encountered fatal error")
            state.createFatalErrorMessage("Encountered a fatal error")
            return true
        },
        readyForDisplay: () => {
            if (
                state.readyForDisplay 
                || state.fatalErrorOccurred
            ) {
                return false
            }
            console.info("Extension requested to show display")
            state.readyForDisplay = true
            state.minimumLoadTimePromise.then(() => {
                console.info("Opening extension frame")
                state.displayExtensionFrame()
            })
            return true
        },
        exit: async (extensionToken: string) => {
            if (typeof extensionToken !== "string") {
                console.warn(`extension token must be a string, got "${betterTypeof(extensionToken)}"`)
                return false
            }
            if (
                state.fatalErrorOccurred 
                || extensionToken !== state.authToken
            ) {
                return false
            }
            await state.confirmExtensionExit()
            return true
        }
    }
}