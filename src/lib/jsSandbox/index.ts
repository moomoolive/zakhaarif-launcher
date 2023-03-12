import {ALLOW_ALL_PERMISSIONS} from "../types/permissions"
import {ALLOW_BLOB_URLS_CSP, ALLOW_DATA_URLS_CSP, createContentSecurityPolicy, generatePermissionsSummary, iframeAllowlist, iframeSandbox} from "../utils/security/permissionsSummary"
import {wRpc} from "w-worker-rpc"
import {PermissionsSummary, mergePermissionSummaries} from "../utils/security/permissionsSummary"
import {createRpcState, AllRpcs, createRpcFunctions} from "./rpcs/index"
import type {ManifestIndex, Shabah} from "../shabah/downloadClient"
import { DeepReadonly } from "../types/utility"
import {SandboxDependencies, RpcPersistentState, RpcState} from "./rpcs/state"
//import {SandboxResponses} from "../../../sandbox/sandboxFunctions"
import { MILLISECONDS_PER_SECOND } from "../utils/consts/time"
import { io } from "../monads/result"
import { removeZipExtension } from "../utils/urls/removeZipExtension"

type SandboxResponses = {
    ping: () => number
}

export type SandboxFunctions = AllRpcs

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

const SANDBOX_PING_INTERVAL = 20 * MILLISECONDS_PER_SECOND
const PING_MARGIN_OF_ERROR = (5 * MILLISECONDS_PER_SECOND) + SANDBOX_PING_INTERVAL

export class JsSandbox {
    private frameListener: (message: MessageEvent<unknown>) => void
    private iframeElement: HTMLIFrameElement
    private state: RpcState
    private readonly dependencies: SandboxDependencies
    private readonly persistentState: RpcPersistentState
    private readonly originalPermissions: PermissionsSummary
    private reconfiguredPermissions: PermissionsSummary | null
    private initialized: boolean
    private rpc: wRpc<SandboxResponses, RpcState>
    private extensionPingTimerId: number
    private latestPingResponse: number
    
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
        this.entry = removeZipExtension(entryUrl)
        this.id = id
        this.name = name
        this.iframeElement = document.createElement("iframe")
        this.frameListener = () => {}
        this.rpc = this.createRpc(this.state)
        this.extensionPingTimerId = -1
        this.latestPingResponse = Date.now() + SANDBOX_PING_INTERVAL
    }

    private async pingExtension(): Promise<boolean> {
        const response = await io.wrap(this.rpc.execute("ping"))
        this.state.logger.info(`extension returned ping. ok=${response.ok}`)
        if (!response.ok || response.data !== 1) {
            return false
        }
        this.latestPingResponse = Date.now()
        return true
    }

    private createRpc(state: RpcState): wRpc<SandboxResponses, RpcState> {
        const self = this
        const responses = createRpcFunctions(state)
        return new wRpc({
            state,
            responses,
            messageTarget: {
                postMessage: (data, transferables) => {
                    self.iframeElement.contentWindow?.postMessage(
                        data, "*",  transferables
                    )
                },
                addEventListener: (_, handler) => {
                    const listener = (event: MessageEvent) => {
                        if (event.source !== self.iframeElement.contentWindow) {
                            return
                        }
                        handler({data: event.data})
                    }
                    self.frameListener = listener
                    window.addEventListener("message", listener)
                },
                removeEventListener() {
                    window.removeEventListener("message", self.frameListener)
                }
            },
        })
    }

    private async getCargoIndexesFromDb(
        canonicalUrls: string[]
    ): Promise<ManifestIndex[]> {
        const targetCargos = await this.dependencies
            .database
            .cargoIndexes
            .getManyIndexes(canonicalUrls)
        const cargos: ManifestIndex[] = []
        for (let i = 0; i < targetCargos.length; i++) {
            const cargo = targetCargos[i]
            if (!cargo) {
                continue
            }
            cargos.push(cargo)
        }
        return cargos
    }

    private async createPermissions(): Promise<PermissionsSummary> {
        const {originalPermissions} = this
        if (originalPermissions.embedExtensions.length < 1) {
            return originalPermissions
        } 
        if (originalPermissions.embedExtensions[0] === ALLOW_ALL_PERMISSIONS) {
            return originalPermissions
        }
        const cargos = await this.getCargoIndexesFromDb(originalPermissions.embedExtensions)
        return mergePermissionSummaries(
            originalPermissions, {cargos}
        )
    }

    private iframeArguments(
        permissionsSummary: PermissionsSummary,
        currentOrigin: string
    ): IframeArguments {
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
            workerSource: [
                "self",
                ALLOW_BLOB_URLS_CSP,
                ALLOW_DATA_URLS_CSP
            ],
            iframeSource: ["none"]
        })
        return iframeArgs
    }

    private prepareIframeSandbox(
        iframe: HTMLIFrameElement, 
        iframeArguments: IframeArguments,
        reconfigured: boolean
    ): HTMLIFrameElement {
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
        this.dependencies.logger.info(
            "opening extension", this.entry,
            "with content-security policy of", contentSecurityPolicy
        )
        iframe.src = `${import.meta.env.VITE_APP_SANDBOX_ORIGIN}/runProgram.html?entry=${encodeURIComponent(this.entry)}&csp=${encodeURIComponent(contentSecurityPolicy)}`
        
        window.clearInterval(this.extensionPingTimerId)
        const self = this
        const pingHandler = async () => {
            const now = Date.now()
            const {latestPingResponse} = self
            const difference = now - latestPingResponse
            const pingDidNotReturn = (
                difference >= PING_MARGIN_OF_ERROR
                || !this.state.readyForDisplay
            )
            if (pingDidNotReturn && !this.state.fatalErrorOccurred) {
                self.state.createFatalErrorMessage(
                    "A fatal error has occurred",
                    "Extension is irresponsive"
                )
                self.state.logger.error(
                    `Extension did not respond to ping within ${SANDBOX_PING_INTERVAL / MILLISECONDS_PER_SECOND} seconds. Extension is most likely not operational.`
                )
                return
            }
            self.pingExtension()
        }
        this.extensionPingTimerId = window.setInterval(
            pingHandler, SANDBOX_PING_INTERVAL
        )
        return iframe
    }

    async initialize(): Promise<HTMLElement> {
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

    domElement(): HTMLElement {
        return this.iframeElement
    }

    destroy(): boolean {
        const callback = this.frameListener
        window.removeEventListener("message", callback)
        this.iframeElement.remove()
        this.dependencies.logger.info(`cleaned up all resources associated with sandbox "${this.id}"`)
        window.clearInterval(this.extensionPingTimerId)
        return true
    }

    private async mutatePermissions(canonicalUrls: string[]): Promise<boolean> {
        const {originalPermissions} = this
        this.dependencies.logger.info("extension has requested permission reconfiguration")
        if (
            this.persistentState.configuredPermissions
            || !this.initialized
            || originalPermissions.embedExtensions.length < 1
            || originalPermissions.embedExtensions[0] !== ALLOW_ALL_PERMISSIONS
        ) {
            this.dependencies.logger.warn("extension reconfiguration failed!")
            return false
        }
        const configuredPermissions = {
            ...this.originalPermissions,
            embedExtensions: canonicalUrls
        } as const
        
        this.reconfiguredPermissions = configuredPermissions
        const cargos = await this.getCargoIndexesFromDb(canonicalUrls)
        const merged =  mergePermissionSummaries(
            this.reconfiguredPermissions, {cargos}
        )
        this.dependencies.logger.info("newly configured permissions =", merged)
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
