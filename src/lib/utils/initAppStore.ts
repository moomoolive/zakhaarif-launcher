import {Shabah} from "../shabah/downloadClient"
import { webAdaptors } from "../shabah/adaptors/web-preset"
import {
    APP_CACHE, 
    BACKEND_CHANNEL_NAME, 
    DOWNLOAD_CLIENT_CHANNEL_NAME, 
    VIRTUAL_FILE_CACHE
} from "../../config"
import { cleanPermissions } from "./security/permissionsSummary"
import type {ServiceWorkerRpcs} from "../../../serviceWorkers/rpcs"
import {wRpc} from "w-worker-rpc"
import {createAppRpcs, DownloadProgressListener} from "./appRpc"
import {EventListenerRecord} from "./eventListener"
import { AppDatabase } from "../database/AppDatabase"
import {FEATURE_CHECK} from "./featureCheck"
import {VERBOSE_LAUNCHER_LOGS} from "./localStorageKeys"
import {AppLogger} from "./appLogger"
import {createBackendChannel, createClientChannel} from "../utils/shabahChannels"

export type EventMap = {
    downloadprogress: DownloadProgressListener
}

export type EventName = keyof EventMap

type EventListenerMap = {
    [key in keyof EventMap]: EventListenerRecord<EventMap[key]>
}

export type AppStoreConfig = {
    setTerminalVisibility: (value: boolean) => void
}

export class AppStore {
    setTerminalVisibility: (visible: boolean) => void
    readonly downloadClient: Shabah
    sandboxInitializePromise: {
        resolve: (value: boolean) => void
        reject: (reason?: unknown) => void
        promise: Promise<boolean>
    }
    serviceWorkerTerminal: wRpc<ServiceWorkerRpcs, {}>
    database: AppDatabase
    readonly browserFeatures: typeof FEATURE_CHECK
    logger: AppLogger

    private eventListenerMap: EventListenerMap
    private globalListeners: Array<{
        event: "service-worker-message",
        handler: Function
    }>

    constructor(config: AppStoreConfig) {
        const verboseLogs = localStorage.getItem(VERBOSE_LAUNCHER_LOGS)
        this.logger = new AppLogger({
            name: `🐬 App Daemon`,
            silent: verboseLogs === null
                ? !import.meta.env.DEV
                : verboseLogs !== "true"
        })
        this.browserFeatures = FEATURE_CHECK
        this.setTerminalVisibility  = config.setTerminalVisibility
        
        const database = new AppDatabase()
        this.database = database
        
        this.downloadClient = new Shabah({
            origin: location.origin,
            adaptors: webAdaptors(APP_CACHE, VIRTUAL_FILE_CACHE),
            permissionsCleaner: cleanPermissions,
            indexStorage: database.cargoIndexes,
            clientMessageChannel: createClientChannel(DOWNLOAD_CLIENT_CHANNEL_NAME),
            backendMessageChannel: createBackendChannel(BACKEND_CHANNEL_NAME)
        })
        
        this.sandboxInitializePromise = {
            resolve: () => {},
            reject: () => {},
            promise: Promise.resolve(true)
        }

        this.eventListenerMap = {
            downloadprogress: new EventListenerRecord()
        }
        this.globalListeners = []

        const self = this
        this.serviceWorkerTerminal = new wRpc<ServiceWorkerRpcs>({
            responses: createAppRpcs({
                getProgressListeners: () => {
                    return self.eventListenerMap.downloadprogress.getAll()
                }
            }),
            messageTarget: {
                postMessage: () => {},
                addEventListener: () => {},
                removeEventListener: () => {}
            },
            state: {}
        })
    }

    initialize(): boolean {
        const self = this
        this.serviceWorkerTerminal.replaceMessageTarget({
            postMessage(data, transferables) {
                const target = navigator.serviceWorker.controller
                if (!target) {
                    return
                }
                target.postMessage(data, transferables)
            },
            addEventListener(_, handler) {
                const event = "service-worker-message"
                self.globalListeners.push({event, handler})
                navigator.serviceWorker.addEventListener("message", handler)
            },
            removeEventListener(_, handler) {
                navigator.serviceWorker.removeEventListener("message", handler)
                const mutateIndex = self.globalListeners.findIndex(
                    (listener) => listener.handler === handler
                )
                if (mutateIndex > -1) {
                    self.globalListeners.splice(mutateIndex, 1)
                }
            }
        })
        return true
    }

    destroy(): boolean {
        for (const {event, handler} of this.globalListeners) {
            switch (event) {
                case "service-worker-message":
                    navigator.serviceWorker.removeEventListener(
                        "message", 
                        handler as (_: MessageEvent) => unknown
                    )
                    break
                default:
                    break
            }
        }
        return true
    }

    addEventListener<Name extends EventName>(
        name: Name, handler: EventMap[Name]
    ): number {
        return this.eventListenerMap[name].addEventListener(handler)
    }

    removeEventListener(name: EventName, handlerId: number): boolean {
        return this.eventListenerMap[name].removeEventListener(handlerId)
    }

}
