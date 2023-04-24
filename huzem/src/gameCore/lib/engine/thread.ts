import {ThreadUtilityLibrary} from "zakhaarif-dev-tools"

export const MAIN_THREAD_ID = 0

export type ThreadLibConfig = {
    threadId: number
}

export function threadLib(config: ThreadLibConfig): ThreadUtilityLibrary {
	const state = {
		threadId: config.threadId
	} as const

	return {
		currentThreadId(): number {
			return state.threadId
		},
		isMainThread(): boolean {
			return state.threadId === MAIN_THREAD_ID
		},
		isWorkerThread(): boolean {
			return state.threadId !== MAIN_THREAD_ID
		},
		count(): readonly [0] {
			return [0] as const
		},
		mainThreadId(): number {
			return MAIN_THREAD_ID
		}
	}
}
