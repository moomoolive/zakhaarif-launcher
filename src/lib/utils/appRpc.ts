import {ProgressUpdateRecord} from "../shabah/serviceWorker/backgroundFetchHandler"

export type DownloadProgressListener = (progress: ProgressUpdateRecord) => unknown

type AppRpcState = {
    getProgressListeners: () => ReadonlyArray<DownloadProgressListener>
}

export const createAppRpcs = (state: AppRpcState) => {
    return {
        notifyDownloadProgress: (progress: ProgressUpdateRecord) => {
            const {getProgressListeners} = state
            const list = getProgressListeners()
            for (const listener of list) {
                listener(progress)
            }
            return true
        }
    } as const
}

export type AppRpcs = ReturnType<typeof createAppRpcs>