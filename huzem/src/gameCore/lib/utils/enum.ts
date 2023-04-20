export const defineEnum = <
    const T extends ReadonlyArray<readonly [statusText: string, status: number]>
>(...e: T) => {
    type EnumTransform = {
        [index in keyof T]: T[index] extends readonly [string, number]
            ? {statusText: T[index][0], status: T[index][1]}
            : never
    }
    return e.map(([statusText, status]) => ({statusText, status})) as EnumTransform
}