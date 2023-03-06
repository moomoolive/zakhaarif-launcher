import {RpcState} from "../state"
import {TransferValue, wRpc} from "w-worker-rpc"
import {type as betterTypeof} from "../../../utils/betterTypeof"
import { stringEqualConstantTimeCompare } from "../../../utils/security/strings"

type FileTransfer = {
    readonly type: string;
    readonly length: string;
    readonly body: ReadableStream<Uint8Array>;
}

export async function getFile(url: string, state: RpcState): Promise<TransferValue<FileTransfer> | null> {
    if (typeof url !== "string") {
        state.logger.warn(`provided url was not a string, got "${betterTypeof(url)}"`)
        return null
    }
    const file = await state.downloadClient.getCachedFile(url)
    if (!file || !file.body) {
        return null
    }
    const type = file.headers.get("content-type") || "text/plain"
    const length = file.headers.get("content-length") || "0"
    const transfer = {type, length, body: file.body} as const
    return wRpc.transfer(transfer, [file.body])
}

type InitialExtensionState = {
    configuredPermissions: boolean;
    queryState: string;
    authToken: string;
    rootUrl: string;
    recommendedStyleSheetUrl: string;
} 

export function getInitialState(_: null, state: RpcState): InitialExtensionState | null {
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
        recommendedStyleSheetUrl: `${state.origin}/${cssExtension}`
    }
}

export function secureContextEstablished(_: null, state: RpcState): boolean {
    state.secureContextEstablished = true
    return true
}

type FatalErrorConfig = {
    extensionToken: string
    details: string
}

export function signalFatalError(params: FatalErrorConfig, state: RpcState): boolean {
    if (
        typeof params !== "object"
        || params === null
        || Array.isArray(params)
    ) {
        state.logger.warn(`fatalErrorConfig must be an object, got "${betterTypeof(params)}"`)
        return false
    }

    if (typeof params.extensionToken !== "string") {
        state.logger.warn(`fatalErrorConfig.extensionToken must be a string, got "${betterTypeof(params.extensionToken)}"`)
        return false
    }
    

    if (typeof params.details !== "string") {
        state.logger.warn(`fatalErrorConfig.details must be a string, got "${betterTypeof(params.details)}"`)
        return false
    }

    const {extensionToken, details} = params

    if (
        state.secureContextEstablished
        && !stringEqualConstantTimeCompare(extensionToken, state.authToken)
    ) {
        state.logger.warn("application signaled fatal error but provided wrong auth token")
        return false
    }

    state.fatalErrorOccurred = true
    state.logger.error("extension encountered fatal error")
    state.createFatalErrorMessage("Encountered a fatal error", details)
    return true
}

export function readyForDisplay(_: null, state: RpcState): boolean {
    if (state.readyForDisplay || state.fatalErrorOccurred) {
        return false
    }
    state.logger.info("Extension requested to show display")
    state.readyForDisplay = true
    state.minimumLoadTimePromise.then(() => {
        state.logger.info("opening extension frame")
        state.displayExtensionFrame()
    })
    return true
}

export async function exit(extensionToken: string, state: RpcState): Promise<boolean> {
    if (state.fatalErrorOccurred) {
        state.logger.warn("cannot exit program if fatal error has already been signaled")
        return false
    }
    
    if (typeof extensionToken !== "string") {
        state.logger.warn(`extension token must be a string, got "${betterTypeof(extensionToken)}"`)
        return false
    }

    if (!stringEqualConstantTimeCompare(extensionToken, state.authToken)) {
        return false
    }
    
    await state.confirmExtensionExit()
    return true
}

export type EssentialRpcs = Omit<
    typeof import("./index"),
    "essentialRpcs"
>

export const essentialRpcs = (): EssentialRpcs => {
    return {
        getFile,
        getInitialState,
        secureContextEstablished,
        signalFatalError,
        readyForDisplay,
        exit
    }
}