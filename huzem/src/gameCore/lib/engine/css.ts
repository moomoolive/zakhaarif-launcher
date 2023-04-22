import type {CssUtilityLibrary} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"

type AddGlobalSheet = CssUtilityLibrary["addGlobalSheet"]

const addGlobalCssSheet: AddGlobalSheet = (url, attributes = []) => {
	const notRunningInBrowser = typeof window === "undefined"
	if (notRunningInBrowser) {
		return {code: "DOM_not_found", sheet: null}
	}
	const cssSheet = document.createElement("link")
	cssSheet.rel = "stylesheet"
	cssSheet.crossOrigin = ""
	cssSheet.href = url
	for (let i = 0; i < attributes.length; i++) {
		const [key, value] = attributes[i]
		cssSheet.setAttribute(key, value)
	}
	document.head.appendChild(cssSheet)
	return {code: "ok", sheet: cssSheet}
}

export class CssLib extends NullPrototype implements CssUtilityLibrary {
	addGlobalSheet = addGlobalCssSheet
}