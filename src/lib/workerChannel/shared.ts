// a random number
const TDATA = 1_432_234

export const transferData = <T>(value: T, transferables: Transferable[]) => ({
    value, 
    transferables,
    __x_tdata__: TDATA
})

export type TransferableReturn<T> = ReturnType<typeof transferData<T>>

export const isTransferable = (data: any) => data?.__x_tdata__ === TDATA