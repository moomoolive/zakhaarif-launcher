import { 
	ComponentMetadata,
	MainThreadEngine,
	StandardLib,
	std,
	DeepReadonly
} from "zakhaarif-dev-tools"
import {Null} from "../utils"
import type {MainEngine} from "./core"
import {EMPTY_OBJECT} from "../utils"

export function stdlib(
	externState: Readonly<MainEngine["stdState"]>
): StandardLib {	
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

	const extern = externState

	const dom: StandardLib["dom"] = {
		rootCanvas: () => extern.rootCanvas,
		rootElement: () => extern.rootElement
	}

	const time: StandardLib["time"] = {
		deltaTime: () => extern.elapsedTime,
		originTime: () => extern.originTime,
		previousFrame: () => extern.previousFrame,
		totalElapsedTime: () => (extern.previousFrame - extern.originTime) + extern.elapsedTime
	}

	const props: StandardLib = {
		...std,
		css,
		dom,
		time
	}
	class Std extends Null {
		constructor() {
			super()
			Object.assign(this, props)
		}
	}
	return new Std() as StandardLib
}

type EngineMeta = MainThreadEngine["meta"]

export class MetaManager extends Null implements EngineMeta {
	context: DeepReadonly<MainEngine["modState"]>

	constructor(context: DeepReadonly<MainEngine["modState"]>) {
		super()
		this.context = context
	}

	modVersion(modName: string): string {
		const {context} = this
		for (let i = 0; i < context.mods.length; i++) {
			const mod = context.mods[i]
			if (mod.name === modName) {
				return mod.version
			}
		}
		return ""
	}

	component(name: string): ComponentMetadata | null {
		const {context} = this
		for (let i = 0; i < context.componentMeta.length; i++) {
			const comp = context.componentMeta[i]
			if (comp.name === name) {
				return comp
			}
		}
		return null
	}

	componentById(id: number): ComponentMetadata | null {
		const idx = id >>> 0 // cast to u32
		const {context} = this
		if (idx >= context.componentMeta.length) {
			return null
		}
		return context.componentMeta[idx]
	}
}