import type {DeepReadonly} from "../types/utility"
import {Cargo} from "../cargo/index"
import {CargoIndex} from "../shabah/backend"
import {ALLOW_ALL_PERMISSIONS, Permissions} from "../types/permissions"
import {createContentSecurityPolicy, generatePermissionsSummary, iframeAllowlist, iframeSandbox} from "../utils/security/permissionsSummary"
import {AppDatabase} from "../database/AppDatabase"
import {sleep} from "../utils/sleep"
import { APP_CACHE } from "../../config"
import {wRpc} from "../wRpc/simple"
import {nanoid} from "nanoid"
import {type as betterTypeof} from "../utils/betterTypeof"
import type {Shabah} from "../shabah/downloadClient"
import {PermissionsSummary, mergePermissionSummaries} from "../utils/security/permissionsSummary"
import {addStandardCargosToCargoIndexes} from "../../standardCargos"

const MINIMUM_AUTH_TOKEN_LENGTH = 20
const AUTH_TOKEN_LENGTH = (() => {
    const additionalLength = Math.trunc(Math.random() * 20)
    return MINIMUM_AUTH_TOKEN_LENGTH + additionalLength
})()

type SandboxDependencies = DeepReadonly<{
    displayExtensionFrame: () => void
    minimumLoadTime: number
    queryState: string
    createFatalErrorMessage: (msg: string) => void
    confirmExtensionExit: () => Promise<void>
    cargoIndex: CargoIndex
    cargo: Cargo<Permissions>
    recommendedStyleSheetUrl: string
    downloadClient: Shabah
}>

type PersistentState = {
    configuredPermissions: boolean
    setEmbedUrls: (canonicalUrls: string[]) => unknown
}

const createRpcState = (
    dependencies: SandboxDependencies, 
    persistentState: PersistentState,
    permissionsSummary: PermissionsSummary
) => {
    const {minimumLoadTime} = dependencies
    const mutableState = {
        readyForDisplay: false,
        secureContextEstablished: false,
        minimumLoadTimePromise: sleep(minimumLoadTime),
        fatalErrorOccurred: false,
        database: new AppDatabase(),
        permissionsSummary,
        authToken: nanoid(AUTH_TOKEN_LENGTH)
    }
    type SandboxMutableState = typeof mutableState
    type InitialState = (
        SandboxDependencies 
        & SandboxMutableState
        & {persistentState: PersistentState}
    )
    return {...dependencies, ...mutableState, persistentState} as InitialState
}

type RpcState = ReturnType<typeof createRpcState>

const embedAnyExtensionRpcs = (state: RpcState) => {
    if (state.persistentState.configuredPermissions) {
        return {} as unknown as typeof rpcs
    }
    const rpcs = {
        reconfigurePermissions: (parameters :{canonicalUrls: string[], authToken: string}) => {
            if (state.persistentState.configuredPermissions) {
                console.warn("attempted to reconfigure permissions, but permissions are already configured")
                return false
            }
            if (
                typeof parameters !== "object"
                || parameters === null
                || typeof parameters.authToken !== "string"
                || !Array.isArray(parameters.canonicalUrls)
            ) {
                console.warn("could not configure permissions because input is invalid. input =", parameters)
                return false
            }
            const {canonicalUrls, authToken} = parameters
            if (authToken !== state.authToken) {
                console.warn("extension attempted to reconfigure permissions but provided wrong auth token")
                return false
            }
            const urls = canonicalUrls.filter((url) => typeof url === "string")
            console.log("got canonical urls", urls)
            window.setTimeout(() => {
                state.persistentState.setEmbedUrls(urls)
            }, 0)
            return true
        }
    } as const
    return rpcs
}

const gameSaveRpcs = (state: RpcState) => {
    if (
        !state.permissionsSummary.gameSaves.read
        && !state.permissionsSummary.gameSaves.write
    ) {
        return {} as typeof allPermissions
    }
    const getSaveFile = async (id: number) => {
        if (typeof id !== "number") {
            console.warn(`extension token must be a number, got "${betterTypeof(id)}"`)
            return null
        }
        if (id < 0) {
            return await state.database.gameSaves.latest()
        }
        return await state.database.gameSaves.getById(id)
    }
    if (!state.permissionsSummary.gameSaves.read) {
        return {
            gameSaveRpcs
        } as unknown as typeof allPermissions
    }
    const allPermissions = {
        getSaveFile
    }
    return allPermissions
}

const essentialRpcs = (state: RpcState) => {
    return {
        getFile: async (url: string) => {
            if (typeof url !== "string") {
                console.warn(`provided url was not a string, got "${betterTypeof(url)}"`)
                return null
            }
            const cache = await caches.open(APP_CACHE)
            const file = await cache.match(url)
            if (!file || !file.body) {
                return null
            }
            const type = file.headers.get("content-type") || "text/plain"
            const length = file.headers.get("content-length") || "0"
            const transfer = {type, length, body: file.body} as const
            return wRpc.transfer(transfer, [file.body])
        },
        getInitialState: () => {
            if (state.secureContextEstablished) {
                return null
            }
            const {queryState, authToken, cargoIndex} = state
            const {resolvedUrl} = cargoIndex
            const {recommendedStyleSheetUrl: rawCssExtension} = state
            const cssExtension = rawCssExtension.startsWith("https://") || rawCssExtension.startsWith("http://")
                ? rawCssExtension
                : rawCssExtension.startsWith("/") ? rawCssExtension.slice(1) : rawCssExtension
            const {configuredPermissions} = state.persistentState
            return {
                configuredPermissions,
                queryState, 
                authToken, 
                rootUrl: resolvedUrl,
                recommendedStyleSheetUrl: `${window.location.origin}/${cssExtension}`
            }
        },
        secureContextEstablished: () => {
            state.secureContextEstablished = true
            return true
        },
        signalFatalError: (extensionToken: string) => {
            if (typeof extensionToken !== "string") {
                console.warn(`extension token must be a string, got "${betterTypeof(extensionToken)}"`)
                return false
            }
            if (
                state.secureContextEstablished 
                && extensionToken !== state.authToken
            ) {
                console.warn("application signaled fatal error but provided wrong auth token")
                return false
            }
            state.fatalErrorOccurred = true
            console.log("extension encountered fatal error")
            state.createFatalErrorMessage("Extension encountered a fatal error")
            return true
        },
        readyForDisplay: () => {
            if (
                state.readyForDisplay 
                || state.fatalErrorOccurred
            ) {
                return false
            }
            console.info("Extension requested to show display")
            state.readyForDisplay = true
            state.minimumLoadTimePromise.then(() => {
                console.info("Opening extension frame")
                state.displayExtensionFrame()
            })
            return true
        },
        exit: async (extensionToken: string) => {
            if (typeof extensionToken !== "string") {
                console.warn(`extension token must be a string, got "${betterTypeof(extensionToken)}"`)
                return false
            }
            if (
                state.fatalErrorOccurred 
                || extensionToken !== state.authToken
            ) {
                return false
            }
            await state.confirmExtensionExit()
            return true
        }
    }
}

const createRpcFunctions = (state: RpcState) => {
    return {
        ...essentialRpcs(state),
        ...embedAnyExtensionRpcs(state),
        ...gameSaveRpcs(state)
    } as const
}

type IframeAttributes = ("allow" | "sandbox")

class IframeArguments {
    attributes: {key: IframeAttributes, value: string}[] = []
    contentSecurityPolicy = ""
}

type JsSandboxOptions = {
    entryUrl: string
    dependencies: SandboxDependencies
    id: string
    name: string
}

export type SandboxFunctions = ReturnType<typeof createRpcFunctions>

export class JsSandbox {
    private frameListener: (message: MessageEvent<unknown>) => void
    private iframeElement: HTMLIFrameElement
    private state: RpcState
    private readonly dependencies: SandboxDependencies
    private readonly persistentState: PersistentState
    private readonly originalPermissions: PermissionsSummary
    private reconfiguredPermissions: PermissionsSummary | null
    private initialized: boolean
    private rpc: wRpc<SandboxFunctions>
    
    readonly id: string
    readonly name: string
    readonly entry: string

    constructor(config: JsSandboxOptions) {
        const {entryUrl, dependencies, id, name} = config
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
        const {downloadClient} = this.state
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
        const {downloadClient} = this.dependencies
        if (
            this.persistentState.configuredPermissions
            || !this.initialized
            || originalPermissions.embedExtensions.length < 1
            || originalPermissions.embedExtensions[0] !== ALLOW_ALL_PERMISSIONS
            || canonicalUrls.length < 1
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
        const merged = mergePermissionSummaries(
            this.reconfiguredPermissions, 
            {...originalCargoIndexes, cargos}
        )
        console.log("permissions", merged)
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
