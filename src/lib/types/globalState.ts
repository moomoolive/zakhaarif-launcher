import type {Shabah} from "../../lib/shabah/downloadClient"
import type {wRpc} from "../wRpc/simple"
import type {ServiceWorkerRpcs} from "../../../serviceWorkers/rpcs"
import type {DownloadProgressListener} from "../utils/appRpc"

export type EventMap = {
    downloadprogress: DownloadProgressListener
}

export type EventName = keyof EventMap

export type TopLevelAppProps = {
    setTerminalVisibility: (visible: boolean) => void
    readonly downloadClient: Shabah
    sandboxInitializePromise: {
        resolve: (value: boolean) => void
        reject: (reason?: unknown) => void
        promise: Promise<boolean>
    },
    serviceWorkerTerminal: wRpc<ServiceWorkerRpcs>
    addEventListener: <Name extends EventName>(name: Name, handler: EventMap[Name]) => void
    removeEventListener: <Name extends EventName>(name: Name, handler: EventMap[Name]) => void
}