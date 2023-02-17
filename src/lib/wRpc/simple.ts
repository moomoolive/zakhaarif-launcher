// a random number
const TDATA = 1_432_234

export interface TransferValue<T> {
    value: T
    transferables: Transferable[]
    __x_tdata__: typeof TDATA
}

const transferData = <T>(value: T, transferables: Transferable[]) => ({
    value, 
    transferables,
    __x_tdata__: TDATA
} as TransferValue<T>)

type TransferableReturn<T> = ReturnType<typeof transferData<T>>

const isTransferable = (data: unknown) => (
    typeof data === "object"
    && data !== null
    && ("__x_tdata__" in data) 
    && data?.__x_tdata__ === TDATA
)

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

type TransferableFunctionReturn<T> = T extends TransferableReturn<infer ValueType>
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

export type MessagableEntity = {
    postMessage: (data: any, transferables: Transferable[]) => any
}

type MessageInterceptor = {
    addEventListener: (
        event: "message", 
        handler: (event: 
            {data: any, source: MessagableEntity}
            | {data: any}
        ) => any
    ) => any
}

type RpcArguments<State extends object> = {
    messageTarget: MessagableEntity
    responses: TerminalActions<State>,
    messageInterceptor: MessageInterceptor
    state?: State
}

const emptyTransferArray = [] as Transferable[]

export class wRpc<
    RecipentActions extends TerminalOutboundActions = {},
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
    private messageInterceptor: MessageInterceptor
    private state: State

    constructor({
        responses,
        messageTarget,
        messageInterceptor,
        state = {} as State
    }: RpcArguments<State>) {
        this.state = state
        this.messageInterceptor = messageInterceptor
        this.messageTarget = messageTarget
        this.messageInterceptor.addEventListener("message", (event) => {
            self.consumeMessage(
                event.data,
                ("source" in event) ? event.source || null : null
            )
        })
        const self = this
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

    replaceSources(
        messageTarget: MessagableEntity,
        messageInterceptor: MessageInterceptor
    ): boolean {
        const self = this
        this.messageInterceptor = messageInterceptor
        this.messageTarget = messageTarget
        this.messageInterceptor.addEventListener("message", (event) => {
            self.consumeMessage(
                event.data,
                ("source" in event) ? event.source || null : null
            )
        })
        return true
    }

    async executeWithSource<T extends keyof RecipentActions>(
        name: T & string,
        source: MessagableEntity,
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
        source: MessagableEntity,
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
        const transfer = isTransferable(data)
        this.transferMessage(
            source,
            RESPONSE_HANDLE, 
            respondingTo, 
            transfer ? (data as TransferableReturn<any>).value : data, 
            transfer ? (data as TransferableReturn<any>).transferables : emptyTransferArray
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
        source: MessagableEntity | null,
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

        if (message.respondingTo === OUTBOUND_MESSAGE) {
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
}
