export type TerminalActions<State extends object> = {
    readonly [key: string]: (
        (() => any)
        | ((param: any) => any)
        | ((param: any, state: State) => any)
    )
}

type S = {
    fn: () => void,
    isCool: boolean
}

const fns = {
    noParam: () => true,
    withParam: (param: number) => true,
    withState: (param: number, state: S) => true
}

type ActionTuples<
    T extends TerminalActions<S>
> = {
    [key in keyof T]: Parameters<T[key]> extends ([param: any] | [param: any, state: any])
        ? [param: Parameters<T[key]>[0]]
        : []
}

type DerivedTup = ActionTuples<typeof fns>

function execute<
    T extends keyof DerivedTup,
>(
    name: T & string,
    ...args: DerivedTup[T] extends [param: any]
        ? (
            [param: DerivedTup[T][0]]
            | [param: DerivedTup[T][0], transfer: Transferable[]]
        )
        : []
): boolean {
    return true
}

const noParam = execute("noParam")
const withParam = execute("withParam", 2)
const withState = execute("withState", 2, [])