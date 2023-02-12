import {Shabah} from "../shabah/downloadClient"
import { webAdaptors } from "../shabah/adaptors/web-preset"
import { APP_CACHE, DOWNLOAD_CLIENT_QUEUE } from "../../config"
import { cleanPermissions } from "./security/permissionsSummary"
import type {ServiceWorkerRpcs} from "../../../serviceWorkers/rpcs"
import {wRpc} from "../wRpc/simple"
import {createAppRpcs, DownloadProgressListener} from "./appRpc"
import {EventListenerRecord} from "./eventListener"
import { AppDatabase } from "../database/AppDatabase"
import { DownloadClientMessage, downloadClientMessageUrl } from "../shabah/backend"
import {FEATURE_CHECK} from "./featureCheck"

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
    serviceWorkerTerminal: wRpc<ServiceWorkerRpcs>
    database: AppDatabase
    readonly browserFeatures: typeof FEATURE_CHECK

    private eventListenerMap: EventListenerMap
    private globalListeners: Array<{
        event: "service-worker-message",
        handler: Function
    }>

    constructor(config: AppStoreConfig) {
        this.browserFeatures = FEATURE_CHECK
        this.setTerminalVisibility  = config.setTerminalVisibility
        this.database = new AppDatabase()
        this.downloadClient = new Shabah({
            origin: location.origin,
            adaptors: webAdaptors(APP_CACHE),
            permissionsCleaner: cleanPermissions,
            messageConsumer: {
                getAllMessages: async () => {
                    const targetCache = await caches.open(DOWNLOAD_CLIENT_QUEUE)
                    const files = await targetCache.keys()
                    const messageFiles = await Promise.all(
                        files.map((request) => targetCache.match(request.url))
                    )
                    const filteredMessages: Response[] = []
                    for (const file of messageFiles) {
                        if (file) {
                            filteredMessages.push(file)
                        } 
                    }
                    const messages = await Promise.all(
                        filteredMessages.map((message) => message.json() as Promise<DownloadClientMessage>)
                    )
                    return messages as ReadonlyArray<DownloadClientMessage>
                },
                deleteMessage: async (message) => {
                    const targetCache = await caches.open(DOWNLOAD_CLIENT_QUEUE)
                    targetCache.delete(downloadClientMessageUrl(message))
                    return true
                }
            }
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
            messageInterceptor: {addEventListener: () => {}},
            messageTarget: {postMessage: () => {}}
        })
    }

    initialize(): boolean {
        const self = this
        this.serviceWorkerTerminal.replaceSources(
            {
                postMessage: (data, transferables) => {
                    const target = navigator.serviceWorker.controller
                    if (!target) {
                        return
                    }
                    target.postMessage(data, transferables)
                }
            },
            {
                addEventListener: async (_, handler) => {
                    const event = "service-worker-message"
                    self.globalListeners.push({event, handler})
                    const sw = navigator.serviceWorker
                    sw.addEventListener("message", handler)
                }
            }
        )
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
