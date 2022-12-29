export type InboundMessageAction = (
    "config:silent_logs"
    | "config:verbose_logs"
    | "list:connected_clients"
    | "list:config"
)

export type InboundMessage = {
    action: InboundMessageAction
}

export type OutMessageType = "error" | "info"

export type OutboundMessage = {
    type: OutMessageType
    contents: string
}

// the below types are an incomplete type implementation
// of the background fetch api. link: https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API
export type BackgroundFetchRecord = {
    readonly request: Request
    readonly responseReady: Promise<Response>
}

export type BackgroundFetchUpdateUIOptions = Partial<{
    title: string
    icons: Array<{
        label?: string
        type?: (
            "image/png" | "image/gif" | "image/bmp" | "image/jpeg"
            | "image/x-png"
        )
        src: string
        sizes?: string
    }>
}>

export type BackgroundFetchResult = "" | "success" | "failure"

export type BackgroundFetchFailureReason = (
    "" | "aborted" | "bad-status"
    | "fetch-error" | "quota-exceeded"
    | "download-total-exceeded"
)

export type BackgroundFetchRegistration = {
   readonly id: string
   readonly uploadTotal: number 
   readonly uploaded: number 
   readonly downloadTotal: number 
   readonly downloaded: number 
   readonly result: BackgroundFetchResult
   readonly failureReason: BackgroundFetchFailureReason
   readonly recordsAvailable: boolean
   abort: () => Promise<boolean>
   // honestly not sure how this works
   //match: () => Promise<BackgroundFetchRecord | undefined>
   matchAll: () => Promise<BackgroundFetchRecord[]>
   addEventListener: (
    eventName: "progress",
    callback: (event: Event) => any
   ) => void
   onprogress: (event: Event) => any
}

export type BackgroundFetchManager = {
    fetch: (
        id: string, 
        requests: string[], 
        options?: Partial<{title: string, downloadTotal: number}>
    ) => Promise<BackgroundFetchRegistration>
    get: (id: string) => Promise<BackgroundFetchRegistration | undefined>
    getIds: () => Promise<string[]>
}

export type BackgroundFetchEvent = {
    waitUntil: (promise: Promise<any>) => any
    readonly registration: BackgroundFetchRegistration
}

export type UpdateUIMethod = (options: BackgroundFetchUpdateUIOptions) => Promise<void>

export type BackgroundFetchUIEventCore = BackgroundFetchEvent & {
    updateUI: UpdateUIMethod
}

export type BackgroundFetchEvents = (
    "backgroundfetchsuccess" | "backgroundfetchfailure"
    | "backgroundfetchabort" | "backgroundfetchclick"
)

type BackgroundFetchUIEvent = BackgroundFetchUIEventCore & Event

export type BackgroundFetchEventMap = {
    "backgroundfetchsuccess": BackgroundFetchUIEvent
    "backgroundfetchfail": BackgroundFetchUIEvent
    "backgroundfetchabort": BackgroundFetchEvent & Event
    "backgroundfetchclick": BackgroundFetchEvent & Event
}

export type BackgroundFetchEventHandlerSetters = {
    onbackgroundfetchsuccess: (event: BackgroundFetchUIEvent & Event) => any
    onbackgroundfetchfail: (event: BackgroundFetchUIEvent & Event) => any
    onbackgroundfetchabort: (event: BackgroundFetchEvent & Event) => any
    onbackgroundfetchclick: (event: BackgroundFetchEvent & Event) => any
}

// background fetch types end
