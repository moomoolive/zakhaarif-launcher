import { 
	StandardLib,
	std
} from "zakhaarif-dev-tools"
import {Null} from "../utils"
import type {MainEngine} from "./core"
import {EMPTY_OBJECT} from "../utils"

export type StdConfig = {
	domElements: MainEngine["domState"],
	time: MainEngine["timeState"]
}

export function stdlib(config: StdConfig): StandardLib {	
	const css: StandardLib["css"] = {
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

	const {domElements} = config
	const dom: StandardLib["dom"] = {
		rootCanvas: () => domElements.rootCanvas,
		rootElement: () => domElements.rootElement
	}

	const {time} = config
	const timelib: StandardLib["time"] = {
		deltaTime: () => time.elapsedTime,
		originTime: () => time.originTime,
		previousFrame: () => time.previousFrame,
		totalElapsedTime: () => (time.previousFrame - time.originTime) + time.elapsedTime
	}

	const props: StandardLib = {
		...std,
		css,
		dom,
		time: timelib
	}
	class Std extends Null {
		constructor() {
			super()
			Object.assign(this, props)
		}
	}
	return new Std() as StandardLib
}