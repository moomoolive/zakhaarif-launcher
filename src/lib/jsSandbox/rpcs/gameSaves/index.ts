import {GameSave} from "../../../database/GameSaves"
import type {RpcState, DaemonRpcTransform} from "../state"
import {type as betterTypeof} from "../../../utils/betterTypeof"
import type {GameSaveDaemonRpcs} from "zakhaarif-dev-tools"

export async function getSaveFile(
	id: number, 
	state: RpcState
): Promise<GameSave | null> {
	if (typeof id !== "number") {
		state.logger.warn(`extension token must be a number, got "${betterTypeof(id)}"`)
		return null
	}
	if (id < 0) {
		return await state.database.gameSaves.latest() || null
	}
	return await state.database.gameSaves.getById(id) || null
}

export function createSave(_: null): number {
	return 1
}

export type GameSaveRpcs = DaemonRpcTransform<GameSaveDaemonRpcs>

export function gameSaveRpcs(state: RpcState): GameSaveRpcs {
	const {gameSaves: savePermissions} = state.permissionsSummary
    
	if (!savePermissions.read && !savePermissions.write) {
		return {} as GameSaveRpcs
	}

	// readonly permissions
	if (savePermissions.read && !savePermissions.write) {
		return {getSaveFile} as GameSaveRpcs
	}
    
	// write only permissions
	if (!savePermissions.read && savePermissions.write) {
		return {createSave} as unknown as GameSaveRpcs
	}

	return {
		getSaveFile,
		createSave
	}
}