import type {RpcState, DaemonRpcTransform} from "../state"
import {TransferValue, wRpc} from "w-worker-rpc"
import {type as betterTypeof} from "../../../utils/betterTypeof"
import type {
    FileTransfer,
    InitialExtensionState,
    FatalErrorConfig,
    EssentialDaemonRpcs
} from "zakhaarif-dev-tools"

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

export function getInitialState(_: null, state: RpcState): InitialExtensionState {
    const {queryState, cargoIndex} = state
    const {resolvedUrl} = cargoIndex
    const {recommendedStyleSheetUrl: rawCssExtension} = state
    const cssExtension = rawCssExtension.startsWith("https://") || rawCssExtension.startsWith("http://")
        ? rawCssExtension
        : rawCssExtension.startsWith("/") ? rawCssExtension.slice(1) : rawCssExtension
    const {configuredPermissions} = state.persistentState
    return {
        configuredPermissions,
        queryState, 
        rootUrl: resolvedUrl,
        recommendedStyleSheetUrl: `${state.origin}/${cssExtension}`
    }
}

export function secureContextEstablished(_: null, state: RpcState): boolean {
    state.secureContextEstablished = true
    return true
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

    if (typeof params.details !== "string") {
        state.logger.warn(`fatalErrorConfig.details must be a string, got "${betterTypeof(params.details)}"`)
        return false
    }

    const {details} = params

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

export async function exit(_: null, state: RpcState): Promise<boolean> {
    if (state.fatalErrorOccurred) {
        state.logger.warn("cannot exit program if fatal error has already been signaled")
        return false
    }
    
    await state.confirmExtensionExit()
    return true
}

export type EssentialRpcs = DaemonRpcTransform<EssentialDaemonRpcs>

export function essentialRpcs(): EssentialRpcs {
    return {
        getFile,
        getInitialState,
        secureContextEstablished,
        signalFatalError,
        readyForDisplay,
        exit
    }
}