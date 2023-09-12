import type {
	ZakhaarifApisField, 
	ExtensionContextId, 
	ExtensionContextObject,
	ExtensionRootId
} from "./consts"
import type {
	ExtensionApis, 
	MainScriptConfig,
	ExtensionModule
} from "zakhaarif-dev-tools"

const ZAKHAARIF_APIS_FIELD: ZakhaarifApisField = "yzapis"
const EXTENSION_CONTEXT_ID: ExtensionContextId = "extension-context-node"

const extApis = (() => {
    type TargetKey = typeof ZAKHAARIF_APIS_FIELD
    type WindowTarget = { [key in TargetKey]: ExtensionApis }
    const topWin = window.top as unknown as WindowTarget
    return topWin[ZAKHAARIF_APIS_FIELD]
})()
const ctx = (() => {
	const node = document.getElementById(EXTENSION_CONTEXT_ID)
	const json = node?.getAttribute("content") || ""
	const ctxObject = JSON.parse(json) as ExtensionContextObject
	return ctxObject
})()

const rootId: ExtensionRootId = "extension-root"
main({
	...ctx, 
	apis: extApis,
	rootElement: document.getElementById(rootId)
})

async function main(config: MainScriptConfig) {
	const {apis, entryUrl: entry} = config
	let extension: ExtensionModule
	const signature = "🔥 [extension ignition]:"
	try {
		console.info(signature, "importing extension", entry)
		extension = await import(/* @vite-ignore */entry)
		console.info(signature, "successfully imported extension", entry)
	} catch (err) {
		console.error(signature, "error importing", entry, err)
		apis.signalFatalError({details: "couldn't find extension entry"})
		return
	}

	if (!("main" in extension)) {
		console.error(signature, "extension", entry, "does not export 'main' from ESmodule")
		apis.signalFatalError({details: "extension encoding is incorrect"})
		return
	}
	console.info(signature, "started extension successfully")
	extension.main(config)
}