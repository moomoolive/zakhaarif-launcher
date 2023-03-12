import {sleep} from "../../utils/sleep"
import {nanoid} from "nanoid"
import {PermissionsSummary} from "../../utils/security/permissionsSummary"
import {
	RpcState, 
	SandboxDependencies, 
	RpcPersistentState
} from "./state"
import {gameSaveRpcs, GameSaveRpcs} from "./gameSaves"
import {embedAnyExtensionRpcs, EmbedAnyExtensionRpcs} from "./embedExtensions/embedAny"
import {essentialRpcs, EssentialRpcs} from "./essential"

const AUTH_TOKEN_LENGTH = 20

export function createRpcState(
	dependencies: SandboxDependencies, 
	persistentState: RpcPersistentState,
	permissionsSummary: PermissionsSummary
): RpcState {
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

export type AllRpcs = (
    EssentialRpcs
    & EmbedAnyExtensionRpcs
    & GameSaveRpcs
)

export function createRpcFunctions(state: RpcState): AllRpcs {
	return {
		...essentialRpcs(),
		...embedAnyExtensionRpcs(state),
		...gameSaveRpcs(state)
	} as const
}
