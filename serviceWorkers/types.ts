export type ServiceWorkerMessageType = "error" | "info"

export type ServiceWorkerMessage = {
    type: ServiceWorkerMessageType
    contents: string
}

export type ServiceWorkerAction = (
    "silence-logs" | "verbose-logs"
)

export type ServiceWorkerOutBoundMessage = {
    action: ServiceWorkerAction 
}