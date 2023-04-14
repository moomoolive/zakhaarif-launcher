export type Float32Token = "f32"
export type Int32Token = "i32"
export type UInt32Token = "u32"

export type ComponentToken = (
    Float32Token | Int32Token | UInt32Token
)

export type ComponentDefinition = {
    readonly [key: string]: ComponentToken
}

export type ComponentType<
    D extends ComponentDefinition = ComponentDefinition
> = {
    [key in keyof D]: D[key] extends ComponentToken ? number : never
}

