import type {f32, i32, u32} from "./primitives"
import type {MemoryLayout} from "./symbols"

export type f32Token = "f32"
export type i32Token = "i32"
export type u32Token = "u32"

export type ComponentToken = (
    f32Token | i32Token | u32Token
)

export type ComponentDefinition = (
    { readonly [key: string]: i32Token }
    | { readonly [key: string]: f32Token }
)

export type StructToken = ComponentToken

export type StructDefintion = {
    readonly [key: string]: StructToken
}

export type TokenToNumber<T extends StructToken> = (
    T extends f32Token ? f32 
    : T extends i32Token ? i32 
    : T extends u32Token ? u32 
    : never
)

export type Struct<
    // _TName is only used for intellisense, doesn't have
    // any functionality
    _TName extends string = "unnamed",
    TDef extends StructDefintion = StructDefintion
> = (
    { [MemoryLayout]: "struct" }
    & {
        [key in keyof TDef]: TDef[key] extends StructToken 
            ? TokenToNumber<TDef[key]>
            : never
    }
)
