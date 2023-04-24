import type {CssUtilityLibrary} from "zakhaarif-dev-tools"
import {EMPTY_OBJECT} from "../utils/nullProto"

export function cssLib(): CssUtilityLibrary {
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