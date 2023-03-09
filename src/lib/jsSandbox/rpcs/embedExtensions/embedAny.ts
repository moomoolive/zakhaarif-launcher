import type {RpcState, DaemonRpcTransform} from "../state"
import {ALLOW_ALL_PERMISSIONS} from "../../../types/permissions"
import {
    ReconfigurationConfig,
    EmbedAnyExtensionDaemonRpcs
} from "../../../../../common/zakhaarif-dev-tools"

export function reconfigurePermissions(
    parameters: ReconfigurationConfig,
    state: RpcState,
): boolean {
    if (state.persistentState.configuredPermissions) {
        state.logger.warn("attempted to reconfigure permissions, but permissions are already configured")
        return false
    }
    if (
        typeof parameters !== "object"
        || parameters === null
        || !Array.isArray(parameters.canonicalUrls)
    ) {
        state.logger.warn("could not configure permissions because input is invalid. input =", parameters)
        return false
    }
    const {canonicalUrls} = parameters
    
    const urls = canonicalUrls.filter((url) => typeof url === "string")
    state.persistentState.setEmbedUrls(urls)
    return true
}

export type EmbedAnyExtensionRpcs = DaemonRpcTransform<EmbedAnyExtensionDaemonRpcs>

export function embedAnyExtensionRpcs(state: RpcState): EmbedAnyExtensionRpcs {
    if (
        state.persistentState.configuredPermissions
        || state.permissionsSummary.embedExtensions.length < 1
        || state.permissionsSummary.embedExtensions[0] !== ALLOW_ALL_PERMISSIONS
    ) {
        return {} as EmbedAnyExtensionRpcs
    }

    return {
        reconfigurePermissions
    }
}
