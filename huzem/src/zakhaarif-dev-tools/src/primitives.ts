import type {
    MemoryLayout, 
    ReferenceType, 
    CanAlias,
    CanMutate,
    PointerType
} from "./symbols"

/**
 * Equivalent to Rust's memory owner (`T`),
 * an owner for a particular piece of heap memory, This allows
 * read & write permission to pointed at memory.
 * __DO NOT__ alias `OwnedReference`s as it is __UNSAFE__.
 * 
 * Memory owners are responsible for freeing memory. __DO 
 * NOT__ free memory if references (`ConstReference` or `MutReference`) 
 * to memory exist.
 */
export type OwnedReference<T extends unknown = unknown> = (
    number & { 
    readonly [ReferenceType]: "T"
    readonly [CanAlias]: false
    readonly [CanMutate]: true
    readonly [PointerType]: T
})
export type UnownedMemory = number & {
    readonly [ReferenceType]?: string
    readonly [CanAlias]?: boolean
    readonly [CanMutate]?: boolean
    readonly [PointerType]?: unknown
}
/** 
 * Equivalent to Rust's reference type (`&T`). Allows
 * read permission to pointed at heap memory, `ConstReference`s can
 * be aliased safely.
 * 
 * __NEVER__ attempt to free (i.e. `wasmHeap.unsafeFree`) 
 * a reference as other places in the code base are still using 
 * it. Only `OwnedPointers` should be freed.
 * */
export type ConstReference<T extends unknown = unknown> = (
    number & { 
    readonly [ReferenceType]: "&T"
    readonly [CanAlias]: true
    readonly [CanMutate]: false
    readonly [PointerType]: T
})
/** 
 * Equivalent to Rust's mutable reference type (`&mut T`), 
 * Allows write permission to pointed at heap memory. 
 * __DO NOT__  alias `MutReference`s as it is __UNSAFE__.
 * 
 *  __NEVER__ attempt to free (i.e. `wasmHeap.unsafeFree`) 
 * a mutable reference as other places in the code base 
 * are still using it. Only `OwnedPointers` should be freed.
 * */
export type MutReference<T extends unknown = unknown> = (
    number & { 
    readonly [ReferenceType]: "&mut T" | "&T"
    readonly [CanAlias]: false
    readonly [CanMutate]: true
    readonly [PointerType]: T
})

/** Same as `number` type */
export type JsNum<T extends number> = T & { 
    readonly [MemoryLayout]?: "js-managed" 
}
/** 
 * Repersents a 32-bit floating point value (C's `float`, 
 * Rust's `f32`). A stricter version of the `f32` type, 
 * will throw type error if number is not __EXACTLY__ a 
 * `strict_f32`. Can only be declared via a cast.
 * 
 * @example <caption>declare via a cast</caption>
 * ```js 
 * const x = 0.0 as strict_f32 
 * ```
 * */
export type strict_f32<T extends number = number> = T & { 
    readonly [MemoryLayout]: "f32" 
}
/**
 * Repersents a 32-bit floating point value (C's `float`, 
 * Rust's `f32`). A looser version of the `strict_f32` type. 
 * It's recommended to declare `f32`s (`strict_f32` as well) 
 * with a decimal on number literal.
 * 
 * @example <caption>add decimal to declaration</caption>
 * ```ts 
 * let f1: f32 = 0.0 // declare f32 (decimal recommended)
 * let f2 = Math.fround(0.0) as f32 // or explicitly cast to f32 if you're really by the book
 * let f3 = 0.0 as f32 as number // can easily be casted to number and vice-versa
 * let f4 = 0.0 as f32 as unknown as i32 // must be explicitly coerced to other number types 
 * let f5 = 0.0 as f32 as i32 // throws error
 * ```
 */
export type f32<T extends number = number> = (
    strict_f32<T> | JsNum<T>
)
/** 
 * Repersents a signed 32-bit integer value (C's `int`, 
 * Rust's `i32`). A stricter version of the `i32` type, 
 * will throw type error if number is not __EXACTLY__ a 
 * `strict_i32`. Can only be declared via a cast.
 * 
 * * @example <caption>declare via a cast</caption>
 * ```js 
 * const x = 0 as strict_i32 
 * ```
 * */
export type strict_i32<T extends number = number> = T & { 
    readonly [MemoryLayout]: "i32" 
}
/**
 * Repersents a signed 32-bit integer value (C's `int`, 
 * Rust's `i32`). A looser version of `strict_i32`. 
 * Note: Integers __CANNOT__ hold decimal values.
 * 
 * @example <caption>usage</caption>
 * ```ts 
 * let i1: i32 = 0 // declare i32
 * let i2 = 0 as i32 // or explicitly cast
 * let i3 = 0 as i32 as number // can easily be casted to number and vice-versa
 * let i4 = 0 as i32 as unknown as f32 // must be explicitly coerced to other number types 
 * let i5 = 0 as i32 as f32 // throws error
 * ```
 */
export type i32<T extends number = number> = (
    strict_i32<T> | JsNum<T>
)
/** 
 * Repersents an unsigned 32-bit integer value (C's `unsigned int`, 
 * Rust's `u32`). A stricter version of the `u32` type, 
 * will throw type error if number is not __EXACTLY__ a 
 * `strict_u32`. Can only be declared via a cast.
 * 
 * * @example <caption>declare via a cast</caption>
 * ```js 
 * const x = 0 as strict_u32 
 * ```
 * */
export type strict_u32<T extends number = number> = T & { 
    readonly [MemoryLayout]: "u32" 
}
/**
 * Repersents an unsigned 32-bit integer value (C's `unsigned int`, 
 * Rust's `u32`). A looser version of `strict_u32`. 
 * Note: Unsigned integers __CANNOT__ hold decimal values
 * or be negative.
 * 
 * @example <caption>usage</caption>
 * ```ts 
 * let i1: u32 = 0 // declare u32
 * let i2 = 0 as u32 // or explicitly cast
 * let i3 = 0 as u32 as number // can easily be casted to number and vice-versa
 * let i4 = 0 as u32 as unknown as f32 // must be explicitly coerced to other number types 
 * let i5 = 0 as u32 as f32 // throws error
 * ```
 */
export type u32<T extends number = number> = (
    strict_u32<T> | JsNum<T>
)

/** A pointer sized number (currently 32-bit) */
export type usize<T extends number = number> = u32<T>