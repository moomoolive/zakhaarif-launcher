import type {
	CssUtilityLibrary, 
	DomUtilityLibrary, 
	MainThreadStandardLibrary, 
	ThreadUtilityLibrary,
	TimeUtilityLibrary
} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"
import type {MainEngine} from "./core"
import {EMPTY_OBJECT} from "../utils/nullProto"
import {cast, type} from "zakhaarif-dev-tools/std"

type ThreadMeta = MainEngine["threadState"]
type TimeState = MainEngine["timeState"]
type DomState = MainEngine["domState"]

export type StandardLibConfig = {
    threadId: number,
	threadMeta: ThreadMeta
	domElements: DomState,
	time: TimeState
}

export class MainStandardLib extends NullPrototype implements MainThreadStandardLibrary {
	readonly thread: ThreadUtilityLibrary
	readonly css: CssUtilityLibrary
	readonly dom: DomUtilityLibrary
	readonly time: TimeUtilityLibrary
	readonly cast = cast
	readonly type = type
    
	constructor(config: StandardLibConfig) {
		super()
		this.thread = threadLib(config)
		this.css = cssLib()
		this.dom = domLib(config)
		this.time = timeLib(config)
	}
}

export type TimeLibConfig = {
	time: TimeState
}

function timeLib(config: TimeLibConfig): TimeUtilityLibrary {
	const {time} = config

	return {
		deltaTime: () => time.elapsedTime,
		originTime: () => time.originTime,
		previousFrame: () => time.previousFrame,
		totalElapsedTime: () => (time.previousFrame - time.originTime) + time.elapsedTime
	}
}

export type DomLibConfig = {
	domElements: DomState
}

function domLib(config: DomLibConfig): DomUtilityLibrary {
	const {domElements} = config

	return {
		rootCanvas: () => domElements.rootCanvas,
		rootElement: () => domElements.rootElement
	}
}

function cssLib(): CssUtilityLibrary {
	return {
		addGlobalSheet: (url, attributes = EMPTY_OBJECT) => {
			const notRunningInBrowser = typeof window === "undefined"
			if (notRunningInBrowser) {
				return {code: "DOM_not_found", sheet: null}
			}
			const cssSheet = document.createElement("link")
			cssSheet.rel = "stylesheet"
			cssSheet.crossOrigin = ""
			cssSheet.href = url
			for (const [key, value] of Object.entries(attributes)) {
				cssSheet.setAttribute(key, value)
			}
			document.head.appendChild(cssSheet)
			return {code: "ok", sheet: cssSheet}
		}
	}
}

export const MAIN_THREAD_ID = 0

const syncthreadIds = [0] as const

export type ThreadLibConfig = {
    threadId: number,
	threadMeta: ThreadMeta
}

function threadLib(config: ThreadLibConfig): ThreadUtilityLibrary {
	const {threadId, threadMeta} = config

	return {
		currentThreadId: () => threadId,
		isMainThread: () => threadId === MAIN_THREAD_ID,
		isWorkerThread: () => threadId !== MAIN_THREAD_ID,
		mainThreadId: () => MAIN_THREAD_ID,
		syncthreads: () => syncthreadIds,
		osthreads: () => threadMeta.activeOsThreads,
	}
}

