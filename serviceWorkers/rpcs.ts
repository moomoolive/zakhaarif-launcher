export type GlobalConfig = {
    version: number
    log: boolean
    updatedAt: number
    createdAt: number
}

export type ServiceWorkerRpcState = {
    configRef: GlobalConfig
    persistConfig: (config: GlobalConfig) => Promise<boolean>
}

export const createServiceWorkerRpcs = (state: ServiceWorkerRpcState) => {
    const {persistConfig} = state
    return {
        config: () => state,
        logger: (verbose: boolean) => {
            state.configRef.log = verbose
            persistConfig(state.configRef)
            return true
        }
    } as const
}

export type ServiceWorkerRpcs = ReturnType<typeof createServiceWorkerRpcs>