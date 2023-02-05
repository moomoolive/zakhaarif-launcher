import {TopLevelAppProps, EventName} from "../types/globalState"
import {Shabah} from "../shabah/downloadClient"
import { webAdaptors } from "../shabah/adaptors/web-preset"
import { APP_CACHE } from "../../config"
import { cleanPermissions } from "./security/permissionsSummary"
import type {ServiceWorkerRpcs} from "../../../serviceWorkers/rpcs"
import {wRpc} from "../wRpc/simple"
import {createAppRpcs, DownloadProgressListener} from "./appRpc"
import {EventListenerRecord} from "./eventListener"

export type AppStoreConfig = {
    setTerminalVisibility: (value: boolean) => void
}

let cached: null | TopLevelAppProps = null

export const initAppStore = (config: AppStoreConfig): TopLevelAppProps => {
    if (cached) {
        return cached
    }

    const {setTerminalVisibility} = config
    
    const listeners = {
        downloadprogress:  new EventListenerRecord<DownloadProgressListener>()
    } as const satisfies Record<EventName, EventListenerRecord<Function>>

    const values: TopLevelAppProps = {
        setTerminalVisibility,
        downloadClient: new Shabah({
            origin: location.origin,
            adaptors: webAdaptors(APP_CACHE),
            permissionsCleaner: cleanPermissions
        }),
        sandboxInitializePromise: {
            resolve: () => {},
            reject: () => {},
            promise: Promise.resolve(true)
        },
        serviceWorkerTerminal: new wRpc<ServiceWorkerRpcs>({
            responses: createAppRpcs({
                getProgressListeners: () => {
                    return listeners.downloadprogress.getAll()
                }
            }),
            messageInterceptor: {
                addEventListener: async (_, handler) => {
                    const sw = navigator.serviceWorker
                    sw.addEventListener("message", handler)
                }
            },
            messageTarget: {
                postMessage: (data, transferables) => {
                    const target = navigator.serviceWorker.controller
                    if (!target) {
                        return
                    }
                    target.postMessage(data, transferables)
                }
            }
        }),
        addEventListener: (name, handler) => {
            return listeners[name].addEventListener(handler)
        },
        removeEventListener: (name, handlerId) => {
            return listeners[name].removeEventListener(handlerId)
        }
    }
    cached = values
    return values
}