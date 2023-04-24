import type {CssUtilityLibrary, EngineStandardLibrary, ThreadUtilityLibrary} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"
import {threadLib} from "./thread"
import {cssLib} from "./css"

export type StandardLibConfig = {
    threadId: number
}

export class StandardLib extends NullPrototype implements EngineStandardLibrary {
	readonly thread: ThreadUtilityLibrary
	readonly css: CssUtilityLibrary
    
	constructor(config: StandardLibConfig) {
		super()
		this.thread = threadLib({threadId: config.threadId})
		this.css = cssLib()
	}
}
