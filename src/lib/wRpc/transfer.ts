export interface TransferValue<T> {
    value: T
    transferables: Transferable[]
    __x_tdata__: true
}

export const transferData = <T>(value: T, transferables: Transferable[]) => ({
    value, 
    transferables,
    __x_tdata__: true
} as TransferValue<T>)