import {
    TransferableReturn, 
    transferData, 
    isTransferable,
    RpcAction,
    TerminalActions,
    RpcReturn,
    MessageContainer,
    OUTBOUND_MESSAGE,
    RESPONSE_HANDLE,
    ERROR_RESPONSE_HANDLE
} from "./shared"

export type MessagableEntity = {
    postMessage: (data: any, transferables: Transferable[]) => any
}

type RecipentRpc<RecipentActions extends TerminalActions> = {
    [key in keyof RecipentActions]: Parameters<RecipentActions[key]>[0] extends undefined 
        ? (target: MessagableEntity) => RpcReturn<ReturnType<RecipentActions[key]>>
        : (
            target: MessagableEntity,
            data: Parameters<RecipentActions[key]>[0],
            transferables?: Transferable[]
        ) => RpcReturn<ReturnType<RecipentActions[key]>>
}

type ServiceWorkerScope = {
    addEventListener: (
        event: "message", 
        handler: (event: {
            data: any, 
            source: MessagableEntity, 
            waitUntil: (promise: Promise<any>) => any
        }) => any
    ) => any
}

type RpcArguments<
    Actions extends TerminalActions,
    RecipentActions extends TerminalActions,
    Scope extends ServiceWorkerScope
> = {
    globalScope: Scope
    recipentFunctions: RecipentActions
    functions: Actions
}

const emptyTransferArray = [] as Transferable[]

export class Rpc<
    Actions extends TerminalActions,
    RecipentActions extends TerminalActions,
    Scope extends ServiceWorkerScope
> {
    static transfer = transferData
    static create = <
        Actions extends TerminalActions,
        RecipentActions extends TerminalActions,
        Scope extends ServiceWorkerScope
    >(options: RpcArguments<Actions, RecipentActions, Scope>) => new Rpc(options).call

    readonly call: RecipentRpc<RecipentActions>
    
    private idCount: number
    private queue: Array<{
        id: number
        resolve: (data: any) => void
        reject: (reason: any) => void
    }>
    private actionsIndex: ReadonlyArray<RpcAction>
    private messageContainer: MessageContainer
    private globalScope: Scope

    private constructor({
        functions,
        recipentFunctions,
        globalScope
    }: RpcArguments<Actions, RecipentActions, Scope>) {
        this.globalScope = globalScope
        const self = this
        this.globalScope.addEventListener("message", (event) => {
            event.waitUntil(
                self.consumeMessage(event.data, event.source)
            )
        })
        this.idCount = 0
        this.queue = []
        this.messageContainer = {
            handle: 0,
            id: -1,
            respondingTo: OUTBOUND_MESSAGE,
            data: null
        }

        const actionHandles = []
        const actionKeys = Object.keys(functions)
        for (let index = 0; index < actionKeys.length; index++) {
            const element = actionKeys[index]
            actionHandles.push(functions[element])
        }
        this.actionsIndex = actionHandles
        
        const sendActions = {}
        const recipentKeys = Object.keys(recipentFunctions)
        for (let i = 0; i < recipentKeys.length; i++) {
            const key = recipentKeys[i]
            const targetHandle = i
            Object.defineProperty(sendActions, key, {
                value: (target: MessagableEntity, data: any, transferables?: Transferable[]) => {
                    return self.outboundMessage(
                        target, 
                        targetHandle, 
                        typeof data === "undefined" ? null : data, 
                        transferables
                    )
                },
                configurable: false,
                writable: false,
                enumerable: true
            })
        }
        this.call = sendActions as unknown as RecipentRpc<RecipentActions>
    }

    private outboundMessage(
        target: MessagableEntity,
        handle: number,
        data: any,
        transferables?: Transferable[]
    ) {
        const self = this
        return new Promise((resolve, reject) => {
            const id = this.idCount
            self.queue.push({id, resolve, reject})
            self.transferMessage(target, handle, OUTBOUND_MESSAGE, data, transferables)
        })
    }

    private responseMessage(
        source: MessagableEntity,
        respondingTo: number, 
        data: any
    ) {
        if (isTransferable(data)) {
            const {value, transferables} = data as TransferableReturn<unknown>
            this.transferMessage(source, RESPONSE_HANDLE, respondingTo, value, transferables)
        } else {
            this.transferMessage(source, RESPONSE_HANDLE, respondingTo, data)
        }
    }

    private errorResponseMessage(
        source: MessagableEntity,
        respondingTo: number, 
        data: string
    ) {
        this.transferMessage(source, ERROR_RESPONSE_HANDLE, respondingTo, data)
    }

    private transferMessage(
        recipentWorker: MessagableEntity,
        handle: number,
        respondingTo: number, 
        data: any,
        transferables?: Transferable[]
    ) {
        const {messageContainer} = this
        const id = this.idCount++
        messageContainer.handle = handle
        messageContainer.respondingTo = respondingTo
        messageContainer.data = data
        messageContainer.id = id
        recipentWorker.postMessage(
            messageContainer, 
            transferables || emptyTransferArray
        )
        messageContainer.data = null
        return id
    }

    private async consumeMessage(
        message: MessageContainer,
        source: MessagableEntity,
    ) {
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

        if (message.handle < 0 || message.handle >= this.actionsIndex.length) {
            console.warn("message attempted to execute an non-existent action", message)
            return
        }
        if (message.respondingTo === OUTBOUND_MESSAGE) {
            const handler = this.actionsIndex[message.handle]
            try {
                this.responseMessage(
                    source, 
                    message.id, 
                    await handler(message.data) ?? null
                )
            } catch (err) {
                this.errorResponseMessage(
                    source,
                    message.id,
                    `rpc function "${handler.name}" encountered an exception. ${err} ${(err as Error)?.stack || "no-stack"}`
                )
            }
            return
        }
        console.warn("incoming message is neither a response to a previous message or a request to perform an action. ignoring message", message)
        return
    }
}
