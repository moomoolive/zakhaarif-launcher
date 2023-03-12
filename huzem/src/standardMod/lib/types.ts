export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : _TupleOf<T, N, []> : never
type _TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : _TupleOf<T, N, [T, ...R]>

export type DeepReadonly<T> = T extends object ? T :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T