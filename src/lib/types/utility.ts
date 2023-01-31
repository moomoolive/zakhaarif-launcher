// taken from https://blog.beraliv.dev/2021-04-25-recursive-readonly-for-objects
export type DeepReadonly<T> = {
    readonly [key in keyof T]: T[key] extends Record<PropertyKey, unknown>
        ? DeepReadonly<T[key]>
        : T[key]
}

// taken from Matt Pocock's awesome vid: https://www.youtube.com/watch?v=EU0TB_8KHpY
export type Mutable<T> = {
    -readonly [key in keyof T]: T[key]
}
