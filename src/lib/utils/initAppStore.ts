import {Shabah} from "../shabah/downloadClient"
import { webAdaptors } from "../shabah/adaptors/web-preset"
import { APP_CACHE } from "../../config"
import { cleanPermissions } from "./security/permissionsSummary"
import type {ServiceWorkerRpcs} from "../../../serviceWorkers/rpcs"
import {wRpc} from "../wRpc/simple"
import {createAppRpcs, DownloadProgressListener} from "./appRpc"
import {EventListenerRecord} from "./eventListener"

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

    private eventListenerMap: EventListenerMap
    private globalListeners: Array<{
        event: "service-worker-message",
        handler: Function
    }>

    constructor(config: AppStoreConfig) {
        this.setTerminalVisibility  = config.setTerminalVisibility
        
        this.downloadClient = new Shabah({
            origin: location.origin,
            adaptors: webAdaptors(APP_CACHE),
            permissionsCleaner: cleanPermissions
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
