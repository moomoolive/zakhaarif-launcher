import type {MainScriptConfig} from "zakhaarif-dev-tools"

export type ZakhaarifApisField = "yzapis"
export type ExtensionContextId = "extension-context-node"
export type ExtensionContextObject = Omit<
    MainScriptConfig, ("apis" | "rootElement")
>
export type ExtensionRootId = "extension-root"
export type ExtensionFrameId = "extension-frame"