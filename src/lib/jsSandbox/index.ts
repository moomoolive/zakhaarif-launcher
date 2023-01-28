import type {DeepReadonly} from "../types/utility"
import {Cargo} from "../cargo/index"
import {CargoIndex} from "../shabah/backend"
import {Permissions} from "../types/permissions"
import {generatePermissionsSummary} from "../utils/security/permissionsSummary"
import {AppDatabase} from "../database/AppDatabase"
import {sleep} from "../utils/sleep"
import { APP_CACHE } from "../../config"
import {wRpc} from "../wRpc/simple"
import {nanoid} from "nanoid"
import {type as betterTypeof} from "../utils/betterTypeof"

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
}>

const createRpcState = (dependencies: SandboxDependencies) => {
    const {minimumLoadTime} = dependencies
    const permissionsSummary = generatePermissionsSummary(
        dependencies.cargo.permissions
    )
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
    type InitialState = SandboxDependencies & SandboxMutableState
    return {...dependencies, ...mutableState} as InitialState
}

const createRpcFunctions = (state: ReturnType<typeof createRpcState>) => {
    console.log("permissions", state.permissionsSummary)
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
            return {
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
        },
        async getSaveFile(id: number) {
            if (typeof id !== "number") {
                console.warn(`extension token must be a number, got "${betterTypeof(id)}"`)
                return false
            }
            if (id < 0) {
                return await state.database.gameSaves.latest()
            }
            return await state.database.gameSaves.getById(id)
        },
    } as const
}

type RpcState = ReturnType<typeof createRpcState>

type JsSandboxOptions = {
    entryUrl: string
    dependencies: SandboxDependencies
    id: string
    name: string
}

export type SandboxFunctions = ReturnType<typeof createRpcFunctions>

export class JsSandbox {
    readonly rpc: wRpc<SandboxFunctions>
    private frameListener: (message: MessageEvent<unknown>) => void
    private iframeElement: HTMLIFrameElement
    private state: RpcState
    readonly id: string
    readonly name: string
    readonly entry: string

    constructor(config: JsSandboxOptions) {
        const {entryUrl, dependencies, id, name} = config
        const state = createRpcState(dependencies)
        this.state = state
        this.entry = entryUrl
        this.id = id
        this.name = name 
        const entry = entryUrl
        const extensionFrame = document.createElement("iframe")
        extensionFrame.id = id
        extensionFrame.name = id

        this.frameListener = () => {}
        const self = this
        const rpc = new wRpc({
            responses: createRpcFunctions(this.state),
            messageTarget: {
                postMessage: (data, transferables) => {
                    extensionFrame.contentWindow?.postMessage(
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
        
        // setting permissions start
        const {permissionsSummary} = state
        let allowList = []
        if (permissionsSummary.camera) {
            allowList.push("camera 'self';")
        }
        if (permissionsSummary.displayCapture) {
            allowList.push("display-capture 'self';")
        }
        if (permissionsSummary.microphone) {
            allowList.push("microphone 'self';")
        }
        if (permissionsSummary.geoLocation) {
            allowList.push("geolocation 'self';")
        }

        extensionFrame.allow = allowList.join(" ")
        let sandboxAttribute = "allow-scripts allow-same-origin"
        if (permissionsSummary.pointerLock) {
            sandboxAttribute += " allow-pointer-lock"
        }
        extensionFrame.setAttribute("sandbox", sandboxAttribute)
        if (permissionsSummary.fullScreen) {
            extensionFrame.setAttribute("allowfullscreen", "")
        }
        let unsafeDirectives = []
        if (permissionsSummary.allowInlineContent) {
            unsafeDirectives.push("'unsafe-inline'")
        }
        if (permissionsSummary.allowUnsafeEval) {
            unsafeDirectives.push("'unsafe-eval'")
        }
        if (permissionsSummary.allowDataUrls) {
            unsafeDirectives.push("data:")
        }
        if (permissionsSummary.allowBlobs) {
            unsafeDirectives.push("blob:")
        }

        const originName = location.origin + "/"

        const extensionOrigin = dependencies.cargoIndex.resolvedUrl
        const allowedOrigins = extensionOrigin === originName
            ? [...permissionsSummary.webRequest]
            : [extensionOrigin, ...permissionsSummary.webRequest]

        const contentSecurityPolicy = encodeURIComponent(
            `default-src 'self' ${unsafeDirectives.join(" ")} ${originName} ${allowedOrigins.join(" ")}; object-src 'none'; frame-src 'none'; manifest-src 'none'; base-uri 'self';`
        )

        // permissions end
        const sandboxOrigin = import.meta.env.VITE_APP_SANDBOX_ORIGIN
        extensionFrame.src = `${sandboxOrigin}/runProgram.html?entry=${encodeURIComponent(entry)}&csp=${encodeURIComponent(contentSecurityPolicy)}`
        this.iframeElement = extensionFrame
        this.rpc = rpc
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
}
