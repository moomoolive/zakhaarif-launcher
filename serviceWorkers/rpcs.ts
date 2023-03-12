export type GlobalConfig = {
    version: number
    log: boolean
    updatedAt: number
    createdAt: number
}

export type ServiceWorkerRpcDependencies = {
    persistConfig: (config: GlobalConfig) => Promise<boolean>
}

export type ServiceWorkerRpcs = {
    config: (_: null, state: GlobalConfig) => GlobalConfig,
    logger: (verbose: boolean, state: GlobalConfig) => boolean
}

export function createServiceWorkerRpcs(
	params: ServiceWorkerRpcDependencies
): ServiceWorkerRpcs {
	return {
		config: (_: null, state: GlobalConfig) => state,
		logger: (verbose: boolean, state: GlobalConfig) => {
			state.log = verbose
			params.persistConfig(state)
			return true
		}
	}
}
