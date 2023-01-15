import {TransferableReturn, transferData, isTransferable} from "./shared"

type RpcAction = (data?: any) => any

type TerminalActions = {
    readonly [key: string]: RpcAction
}

type TransferableFunctionReturn<T> = T extends TransferableReturn<infer ValueType>
    ? ValueType
    : T

type RpcReturn<T> = T extends Promise<any>
    ? TransferableFunctionReturn<T>
    : Promise<TransferableFunctionReturn<T>>

type RecipentRpc<RecipentActions extends TerminalActions> = {
    [key in keyof RecipentActions]: Parameters<RecipentActions[key]>[0] extends undefined 
        ? () => RpcReturn<ReturnType<RecipentActions[key]>>
        : (
            data: Parameters<RecipentActions[key]>[0],
            transferables?: Transferable[]
        ) => RpcReturn<ReturnType<RecipentActions[key]>>
}

type MessageContainer = {
    handle: number
    id: number
    respondingTo: number
    data: any
}

const OUTBOUND_MESSAGE = -1
const RESPONSE_HANDLE = 1_000_000

export type MessagableEntity = {
    postMessage: (data: any, transferables: Transferable[]) => any
    addEventListener: (event: "message", handler: (event: {data: any}) => any) => any
}

type RpcArguments<
    Actions extends TerminalActions,
    RecipentActions extends TerminalActions,
    Recipent extends MessagableEntity
> = {
    recipentWorker: Recipent
    recipentFunctions: RecipentActions
    functions: Actions
}

const emptyTransferArray = [] as Transferable[]

export class Rpc<
    Actions extends TerminalActions,
    RecipentActions extends TerminalActions,
    Recipent extends MessagableEntity
> {
    static transfer = transferData
    static create = <
        Actions extends TerminalActions,
        RecipentActions extends TerminalActions,
        Recipent extends MessagableEntity
    >(options: RpcArguments<Actions, RecipentActions, Recipent>) => new Rpc(options).call

    readonly call: RecipentRpc<RecipentActions>
    
    private idCount: number
    private queue: Array<{
        id: number
        resolve: (data: any) => void
    }>
    private actionsIndex: ReadonlyArray<RpcAction>
    private messageContainer: MessageContainer
    private recipentWorker: Recipent

    private constructor({
        functions,
        recipentFunctions,
        recipentWorker
    }: RpcArguments<Actions, RecipentActions, Recipent>) {
        this.recipentWorker = recipentWorker
        const self = this
        this.recipentWorker.addEventListener("message", (event) => {
            self.consumeMessage(event.data)
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
                value: (data: any, transferables?: Transferable[]) => {
                    return self.outboundMessage(targetHandle, data, transferables)
                },
                configurable: false,
                writable: false,
                enumerable: true
            })
        }
        this.call = sendActions as unknown as RecipentRpc<RecipentActions>
    }

    private outboundMessage(
        handle: number,
        data: any,
        transferables?: Transferable[]
    ) {
        const self = this
        return new Promise((resolve) => {
            const id = self.transferMessage(handle, OUTBOUND_MESSAGE, data, transferables)
            self.queue.push({id, resolve})
        })
    }

    private responseMessage(
        respondingTo: number, 
        data: any
    ) {
        if (isTransferable(data)) {
            const {value, transferables} = data as TransferableReturn<unknown>
            this.transferMessage(RESPONSE_HANDLE, respondingTo, value, transferables)
        } else {
            this.transferMessage(RESPONSE_HANDLE, respondingTo, data)
        }
    }

    private transferMessage(
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
        this.recipentWorker.postMessage(
            messageContainer, 
            transferables || emptyTransferArray
        )
        messageContainer.data = null
        return id
    }

    private async consumeMessage(message: MessageContainer) {
        if (message.handle === RESPONSE_HANDLE) {
            const {queue} = this
            for (let index = 0; index < queue.length; index++) {
                const element = queue[index]
                if (message.respondingTo === element.id) {
                    element.resolve(message.data)
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
            this.responseMessage(
                message.id, await handler(message.data)
            )
            return
        }
        console.warn("incoming message is neither a response to a previous message or a request to perform an action. ignoring message", message)
        return
    }
}
