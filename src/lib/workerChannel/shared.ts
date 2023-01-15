// a random number
const TDATA = 1_432_234

export const transferData = <T>(value: T, transferables: Transferable[]) => ({
    value, 
    transferables,
    __x_tdata__: TDATA
} as {value: T, transferables: Transferable[]})

export type TransferableReturn<T> = ReturnType<typeof transferData<T>>

export const isTransferable = (data: any) => data?.__x_tdata__ === TDATA

export type RpcAction = (data?: any) => any

export type TerminalActions = {
    readonly [key: string]: RpcAction
}

type TransferableFunctionReturn<T> = T extends TransferableReturn<infer ValueType>
    ? ValueType
    : T

export type RpcReturn<T> = T extends Promise<any>
    ? TransferableFunctionReturn<T>
    : Promise<TransferableFunctionReturn<T>>

export type MessageContainer = {
    handle: number
    id: number
    respondingTo: number
    data: any
}

export const OUTBOUND_MESSAGE = -1
export const ERROR_RESPONSE_HANDLE = 1_000_001
export const RESPONSE_HANDLE = 1_000_000
    