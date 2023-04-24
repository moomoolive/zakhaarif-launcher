import {ThreadUtilityLibrary} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"

export const MAIN_THREAD_ID = 0

export type ThreadLibConfig = {
    threadId: number
}

export class ThreadLib extends NullPrototype implements ThreadUtilityLibrary {
	readonly threadId: number

	constructor(config: ThreadLibConfig) {
		super()
		this.threadId = config.threadId
	}

	currentThreadId(): number {
		return this.threadId
	}

	isMainThread(): boolean {
		return this.threadId === MAIN_THREAD_ID
	}

	isWorkerThread(): boolean {
		return this.threadId !== MAIN_THREAD_ID
	}

	count(): readonly [0] {
		return [0] as const
	}

	mainThreadId(): number {
		return MAIN_THREAD_ID
	}
}