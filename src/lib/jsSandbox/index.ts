import {ALLOW_ALL_PERMISSIONS} from "../types/permissions"
import {createContentSecurityPolicy, generatePermissionsSummary, iframeAllowlist, iframeSandbox} from "../utils/security/permissionsSummary"
import {wRpc} from "../wRpc/simple"
import {PermissionsSummary, mergePermissionSummaries} from "../utils/security/permissionsSummary"
import {addStandardCargosToCargoIndexes} from "../../standardCargos"
import {
    essentialRpcs, 
    embedAnyExtensionRpcs,
    gameSaveRpcs,
    RpcState,
    SandboxDependencies,
    createRpcState,
    RpcPersistentState
} from "./rpc"
import type {Shabah} from "../shabah/downloadClient"
import { DeepReadonly } from "../types/utility"

const createRpcFunctions = (state: RpcState) => {
    return {
        ...essentialRpcs(state),
        ...embedAnyExtensionRpcs(state),
        ...gameSaveRpcs(state)
    } as const
}

export type SandboxFunctions = ReturnType<typeof createRpcFunctions>

class IframeArguments {
    attributes: {key: ("allow" | "sandbox"), value: string}[] = []
    contentSecurityPolicy = ""
}

type JsSandboxOptions = {
    entryUrl: string
    dependencies: SandboxDependencies
    id: string
    name: string
    downloadClient: Shabah
}

export class JsSandbox {
    private frameListener: (message: MessageEvent<unknown>) => void
    private iframeElement: HTMLIFrameElement
    private state: RpcState
    private readonly dependencies: SandboxDependencies
    private readonly persistentState: RpcPersistentState
    private readonly originalPermissions: PermissionsSummary
    private reconfiguredPermissions: PermissionsSummary | null
    private initialized: boolean
    private rpc: wRpc<SandboxFunctions>
    
    readonly id: string
    readonly name: string
    readonly entry: string
    readonly downloadClient: DeepReadonly<Shabah>

    constructor(config: JsSandboxOptions) {
        const {entryUrl, dependencies, id, name} = config
        this.downloadClient = config.downloadClient
        const permissionsSummary = generatePermissionsSummary(
            dependencies.cargo.permissions
        )
        this.initialized = false
        this.originalPermissions = permissionsSummary
        this.reconfiguredPermissions = null
        const self = this
        this.persistentState = {
            configuredPermissions: (
                permissionsSummary.embedExtensions.length < 1
                || permissionsSummary.embedExtensions[0] !== ALLOW_ALL_PERMISSIONS
            ),
            setEmbedUrls: (canonicalUrls) => {
                return self.mutatePermissions(canonicalUrls)
            },
        }
        this.dependencies = dependencies
        const state = createRpcState(
            dependencies, 
            this.persistentState,
            permissionsSummary,
        )
        this.state = state
        this.entry = entryUrl
        this.id = id
        this.name = name
        this.iframeElement = document.createElement("iframe")
        this.frameListener = () => {}
        this.rpc = this.createRpc(this.state)
    }

    private createRpc(state: RpcState) {
        const self = this
        return new wRpc({
            responses: createRpcFunctions(state),
            messageTarget: {
                postMessage: (data, transferables) => {
                    self.iframeElement.contentWindow?.postMessage(
                        data, "*", transferables
                    )
                }
            },
            messageInterceptor: {
                addEventListener: (_, handler) => {
                    const listener = (event: MessageEvent) => {
                        handler({data: event.data})
                    }
                    self.frameListener = listener
                    window.addEventListener("message", listener)
                }
            }
        })
    }

    private async createPermissions() {
        const {downloadClient} = this
        const {originalPermissions} = this
        if (originalPermissions.embedExtensions.length < 1) {
            return originalPermissions
        } 
        if (originalPermissions.embedExtensions[0] === ALLOW_ALL_PERMISSIONS) {
            return originalPermissions
        }
        const cargoIndexes = await downloadClient.getCargoIndices()
        return mergePermissionSummaries(originalPermissions, cargoIndexes)
    }

    private iframeArguments(
        permissionsSummary: PermissionsSummary,
        currentOrigin: string
    ) {
        const iframeArgs = new IframeArguments()
        iframeArgs.attributes.push({
            key: "allow", 
            value: iframeAllowlist(permissionsSummary)
        })
    
        iframeArgs.attributes.push({
            key: "sandbox", 
            value: iframeSandbox(permissionsSummary)
        })

        iframeArgs.contentSecurityPolicy = createContentSecurityPolicy(permissionsSummary, {
            allowRequestsToHostOrigin: true,
            hostOrigin: currentOrigin + "/",
            cargoOrigin: this.state.cargoIndex.resolvedUrl,
            workerSource: ["self"],
            iframeSource: ["none"]
        })
        return iframeArgs
    }

    private prepareIframeSandbox(
        iframe: HTMLIFrameElement, 
        iframeArguments: IframeArguments,
        reconfigured: boolean
    ) {
        const {contentSecurityPolicy, attributes} = iframeArguments
        iframe.id = this.id
        iframe.name = this.name
        for (let i = 0; i < attributes.length; i++) {
            const {key, value} = attributes[i]
            iframe.setAttribute(key, value)
        }
        if (reconfigured) {
            iframe.setAttribute("reconfigured-timestamp", Date.now().toString())
        }
        const sandboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
        iframe.src = `${sandboxOrigin}/runProgram.html?entry=${encodeURIComponent(this.entry)}&csp=${encodeURIComponent(contentSecurityPolicy)}`
        return iframe
    }

    async initialize() {
        const permissionsSummary = await this.createPermissions()
        const iframeArguments = this.iframeArguments(
            permissionsSummary, location.origin
        )
        const sandbox = this.prepareIframeSandbox(
            this.iframeElement, 
            iframeArguments,
            false
        ) as HTMLElement
        this.initialized = true
        return sandbox
    }

    domElement() {
        return this.iframeElement as HTMLElement
    }

    destroy() {
        const callback = this.frameListener
        window.removeEventListener("message", callback)
        this.iframeElement.remove()
        console.log(`cleaned up all resources associated with sandbox "${this.id}"`)
    }

    private async mutatePermissions(canonicalUrls: string[]) {
        const {originalPermissions} = this
        const {downloadClient} = this
        if (
            this.persistentState.configuredPermissions
            || !this.initialized
            || originalPermissions.embedExtensions.length < 1
            || originalPermissions.embedExtensions[0] !== ALLOW_ALL_PERMISSIONS
        ) {
            return false
        }
        const configuredPermissions = {
            ...this.originalPermissions,
            embedExtensions: canonicalUrls
        } as const
        this.reconfiguredPermissions = configuredPermissions
        const originalCargoIndexes = await downloadClient.getCargoIndices()
        const cargos = addStandardCargosToCargoIndexes(originalCargoIndexes.cargos)
        const merged = canonicalUrls.length < 1 
            ? configuredPermissions
            : mergePermissionSummaries(
                this.reconfiguredPermissions, 
                {...originalCargoIndexes, cargos}
            )
        //console.log("permissions", merged)
        this.persistentState.configuredPermissions = true
        const iframeArguments = this.iframeArguments(
            merged, location.origin,
        )
        const newIframe = document.createElement("iframe")
        const newFrame = this.prepareIframeSandbox(
            newIframe, iframeArguments, true
        )
        this.state = createRpcState(
            this.dependencies,
            this.persistentState,
            this.reconfiguredPermissions,
        )
        const old = this.iframeElement
        newFrame.className = old.className
        newFrame.setAttribute(
            "style", 
            old.getAttribute("style") || ""
        )
        this.iframeElement = newFrame
        window.removeEventListener("message", this.frameListener)
        this.rpc = this.createRpc(this.state)
        old.replaceWith(newFrame)
        return true
    }
}
