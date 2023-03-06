import {transferData, TransferValue} from "./transfer"

type RpcResponse<State extends object> = (
    (() => any)
    | ((param: any) => any)
    | ((param: any, state: State) => any)
)

type RpcOutboundAction = (
    (() => any)
    | ((param: any) => any)
    | ((param: any, state: any) => any)
)

type TerminalOutboundActions = {
    readonly [key: string]: RpcOutboundAction
}

export type TerminalActions<State extends object> = {
    readonly [key: string]: RpcResponse<State>
}

type TransferableFunctionReturn<T> = T extends TransferValue<infer ValueType>
    ? ValueType
    : T

export type RpcReturn<T> = T extends Promise<infer PromiseResolve>
    ? Promise<TransferableFunctionReturn<PromiseResolve>>
    : Promise<TransferableFunctionReturn<T>>

export type MessageContainer = {
    handle: string
    id: number
    respondingTo: number
    data: unknown
}

type TerminalActionTuples<
    T extends TerminalOutboundActions
> = {
    [key in keyof T]: Parameters<T[key]> extends ([param: any] | [param: any, state: any])
        ? Parameters<T[key]>[0] extends (null | undefined)
            ? [] : [param: Parameters<T[key]>[0]]
        : []
}

export const OUTBOUND_MESSAGE = -1
export const ERROR_RESPONSE_HANDLE = "__x_rpc_error__"
export const RESPONSE_HANDLE = "__x_rpc_response__"

export type MessageHandler = (event: {data: unknown, source: MessagableEntity} | {data: unknown}) => unknown

export type MessagableEntity = {
    postMessage: (data: any, transferables: Transferable[]) => unknown
    addEventListener: (event: "message", handler: MessageHandler) => unknown
    removeEventListener: (event: "message", handler: MessageHandler) => unknown
}

export type MessageTarget = {
    postMessage: (data: any, transferables: Transferable[]) => unknown
}

type RpcConfig<State extends object> = {
    messageTarget: MessagableEntity
    responses: TerminalActions<State>,
    state: State
}

const emptyTransferArray = [] as Transferable[]

export class wRpc<
    RecipentActions extends TerminalOutboundActions,
    State extends object = {},
> {
    static transfer = transferData

    private idCount: number
    private queue: Array<{
        id: number
        resolve: (data: any) => void
        reject: (reason: any) => void
    }>
    private actionsIndex: Map<string, RpcResponse<State>>
    private messageContainer: MessageContainer
    private messageTarget: MessagableEntity
    private messageHandlerRef: MessageHandler
    
    state: State

    constructor({
        responses,
        messageTarget,
        state
    }: RpcConfig<State>) {
        const self = this
        this.state = state
        this.messageTarget = messageTarget
        this.messageHandlerRef = (event) => {
            self.consumeMessage(
                event.data as MessageContainer,
                ("source" in event) ? event.source || null : null
            )
        }
        this.messageTarget.addEventListener("message", self.messageHandlerRef)
        
        this.idCount = 0
        this.queue = []
        this.messageContainer = {
            handle: "",
            id: -1,
            respondingTo: OUTBOUND_MESSAGE,
            data: null
        }

        this.actionsIndex = new Map()
        const actionKeys = Object.keys(responses)
        for (let index = 0; index < actionKeys.length; index++) {
            const element = actionKeys[index]
            this.actionsIndex.set(element, responses[element])
        }
    }

    cleanup(): boolean {
        this.messageTarget.removeEventListener("message", this.messageHandlerRef)
        return true
    }

    replaceMessageTarget(messageTarget: MessagableEntity): boolean {
        const self = this
        this.cleanup()
        this.messageTarget = messageTarget
        this.messageTarget.addEventListener("message", (event) => {
            self.consumeMessage(
                event.data as MessageContainer,
                ("source" in event) ? event.source || null : null
            )
        })
        return true
    }

    async executeWithSource<T extends keyof RecipentActions>(
        name: T & string,
        source: MessageTarget,
        data: Parameters<RecipentActions[T]>[0] extends undefined ? null : Parameters<RecipentActions[T]>[0], 
        transferables?: Transferable[]
    ) {
        return await this.outboundMessage(
            source, name, data, transferables
        ) as RpcReturn<ReturnType<RecipentActions[T]>>
    }

    execute<T extends keyof RecipentActions>(
        name: T & string,
        ...args: TerminalActionTuples<RecipentActions>[T] extends [params: any]
            ? (
                [param: TerminalActionTuples<RecipentActions>[T][0]]
                | [param: TerminalActionTuples<RecipentActions>[T][0], transferables: Transferable[]]
            )
            : []
    ): Promise<RpcReturn<ReturnType<RecipentActions[T]>>>
    async execute<T extends keyof RecipentActions>(
        name: T & string,
        param: null = null ,
        transferables: Transferable[] = []
    ): Promise<RpcReturn<ReturnType<RecipentActions[T]>>> {
        return await this.outboundMessage(
            this.messageTarget, name, param, transferables
        ) as RpcReturn<ReturnType<RecipentActions[T]>>
    }

    private outboundMessage(
        source: MessageTarget,
        handle: string,
        data: unknown = null,
        transferables: Transferable[] = emptyTransferArray
    ) {
        const self = this
        return new Promise((resolve, reject) => {
            const id = this.idCount
            self.queue.push({id, resolve, reject})
            self.transferMessage(
                source, 
                handle, 
                OUTBOUND_MESSAGE, 
                data, 
                transferables
            )
        })
    }

    private responseMessage(
        source: MessagableEntity | null,
        respondingTo: number, 
        data: unknown
    ) {
        const transfer = (
            typeof data === "object"
            && data !== null
            && (data as TransferValue<unknown>).__x_tdata__ === true
        )
        this.transferMessage(
            source,
            RESPONSE_HANDLE, 
            respondingTo, 
            transfer ? (data as TransferValue<any>).value : data, 
            transfer ? (data as TransferValue<any>).transferables : emptyTransferArray
        )
    }

    private errorResponseMessage(
        source: MessagableEntity | null,
        respondingTo: number, 
        errorMessage: string
    ) {
        this.transferMessage(
            source,
            ERROR_RESPONSE_HANDLE, 
            respondingTo, 
            errorMessage
        )
    }

    private transferMessage(
        source: MessageTarget | null,
        handle: string,
        respondingTo: number, 
        data: unknown,
        transferables?: Transferable[]
    ) {
        const {messageContainer} = this
        const id = this.idCount++
        messageContainer.handle = handle
        messageContainer.respondingTo = respondingTo
        messageContainer.data = data ?? null
        messageContainer.id = id
        const entity = source || this.messageTarget
        entity.postMessage(
            messageContainer, 
            transferables || emptyTransferArray
        )
        return id
    }

    private async consumeMessage(
        message: MessageContainer,
        source: MessagableEntity | null
    ) {
        if (message === null || typeof message !== "object") {
            console.warn("recieved message was not an object ignoring message", message)
            return
        }

        if (
            message.handle === RESPONSE_HANDLE
            || message.handle === ERROR_RESPONSE_HANDLE
        ) {
            const {queue} = this
            for (let index = 0; index < queue.length; index++) {
                const element = queue[index]
                if (message.respondingTo === element.id) {
                    if (message.handle === ERROR_RESPONSE_HANDLE) {
                        element.reject(message.data)
                    } else {
                        element.resolve(message.data)
                    }
                    queue.splice(index, 1)
                    return
                }
            }
            console.warn("incoming response doesn't map to any queued message. ignoring", message)
            return
        }

        if (!this.actionsIndex.has(message.handle)) {
            this.errorResponseMessage(
                source,
                message.id,
                `attempted to call non-existent handler "${message.handle}"`
            )
            return
        }

        if (
            message.respondingTo === OUTBOUND_MESSAGE 
            && message.data !== undefined
        ) {
            const handler = this.actionsIndex.get(message.handle)!
            try {
                const data = await handler(message.data, this.state) ?? null
                this.responseMessage(source, message.id, data)
            } catch (err) {
                this.errorResponseMessage(
                    source,
                    message.id,
                    `rpc function "${message.handle}" encountered an exception. ${err} ${(err as Error)?.stack || "no-stack"}`
                )
            }
            return
        }
        console.warn("incoming message is neither a response to a previous message or a request to perform an action. ignoring message", message)
        return
    }

    addResponses(
        responses: TerminalActions<State>, 
        {allowOverwrite = false} = {}
    ): boolean {
        const actionKeys = Object.keys(responses)
        let added = false
        for (let index = 0; index < actionKeys.length; index++) {
            const element = actionKeys[index]
            if (!allowOverwrite && this.actionsIndex.has(element)) {
                continue
            }
            added = true
            this.actionsIndex.set(element, responses[element])
        }
        return added
    }
}
