import type {
    ConstReference,
    MutReference,
    OwnedReference,
    f32, 
    i32, 
    u32
} from "./primitives"

export const type = {
    u32: <T extends number>(value: T) => (value >>> 0) as u32<T>,
    f32: <T extends number>(value: T) => Math.fround(value) as f32<T>,
    i32: <T extends number>(value: T) => (value | 0) as i32<T>
} as const

export const cast = {
    toConstRef: <T>(ref: OwnedReference<T> | MutReference<T>) => ref as unknown as ConstReference<T>,
    u32: <T extends number>(value: T) => (value >>> 0) as u32<T>,
    f32: <T extends number>(value: T) => Math.fround(value) as f32<T>,
    i32: <T extends number>(value: T) => (value | 0) as i32<T>
} as const