export type InboundMessageAction = (
    "config:silent_logs"
    | "config:verbose_logs"
    | "list:consts"
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