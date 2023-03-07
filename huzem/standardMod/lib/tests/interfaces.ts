/* works but no context */
type t = [number, number, number]

const fn = (...pos: t) => 0

/* ideally what I would want but is impossible */
const fn2 = (x: number, y: number, z: number) => 0

interface f32 extends Number {}

interface Arg<_name extends string, _type> extends Number {}

type t2 = [Arg<"x", f32>, Arg<"y", f32>, Arg<"z", f32>]

const ecs = { position: (...arg: t2) => 0 }

const x2 = ecs.position(1.0, 1.0, 1.0)

type Push<T, E> = T extends any[] ? [E, ...T] : [];

type UnionToIoFn<U> =
    (U extends any ? (k: (x: U) => void) => void : never) extends
    ((k: infer I) => void) ? I : never

type UnionPop<F> =
    F extends ({ (x: infer X): void; })
        ? X
        : never;

type UnionToTupleIter<U, Res> =
    [U] extends [never]
        ? Res
        : UnionToTupleIter<
            Exclude<U, UnionPop<UnionToIoFn<U>>> ,
            Push<Res, UnionPop<UnionToIoFn<U>>>
          >


type UnionToTuple<U> = UnionToTupleIter<U, []>;

type BaseType = Readonly<{
    x: number,
    y: number,
    z: number
}>

type BaseTypeTuple = UnionToTuple<keyof BaseType>

type BaseTypeArgs<T, K extends Array<keyof T>> = {
    [index in keyof K]: K[index] extends string 
        ? Arg<K[index], T[K[index]]>
        : never
}

const inputFn = (...arg: BaseTypeArgs<BaseType, BaseTypeTuple>) => { }

export {}