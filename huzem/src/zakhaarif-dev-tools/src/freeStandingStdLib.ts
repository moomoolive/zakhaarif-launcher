import type {
    f32, 
    i32, 
    u32
} from "./primitives"
import type {
    ModModules,
    ComponentDeclaration,
    LinkableMod,
    DependenciesList,
    ModData,
    DependentsWithBrand,
    ModLifeCycleEvents,
    MainThreadEngine,
    EcsSystem,
    QueryRecord,
    QueryDescriptor,
    QueryDef,
    Option,
    QueryTermsMeta,
    ArchetypeCompMeta,
    ArchetypeDef,
    ArchetypeRecord,
} from "./mods"
import {InnerMods, InnerValue} from "./symbols"
import type {
    ComponentDefinition, 
    Struct
} from "./components"

const libu32 = <T extends number>(value: T) => (value >>> 0) as u32<T>
const libf32 = <T extends number>(value: T) => Math.fround(value) as f32<T>
const libi32 = <T extends number>(value: T) => (value | 0) as i32<T>

export const std = {
    u32: libu32,
    f32: libf32,
    i32: libi32,
} as const

type TypeUtils<T extends ModModules> = (
    Required<ModLifeCycleEvents<T>>
    & {
        Engine: MainThreadEngine<T>,
        System: EcsSystem<T>
    }
)

export type Zutils<T extends LinkableMod> = TypeUtils<[
    T, 
    ...NonNullable<T["data"]["dependencies"]>[typeof InnerMods]
]>

// taken from: https://stackoverflow.com/questions/68042704/convert-union-type-to-intersection-type
type UnionToIntersection<U> = (
    U extends any ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

type ComponentMap<
    T extends { [key: string]: { [key: string]: ComponentDefinition } } = {}
> = UnionToIntersection<T[keyof T]>

const QUERY_BUILDER_EMPTY: ReadonlyArray<QueryDescriptor> = []

type ComponentMapSections<T extends ModData> = {
    self: ComponentMap<{
        [key in T["name"]]: {
            [key in keyof NonNullable<T["components"]> as `${T["name"] & string}_${key & string}`]: (
                NonNullable<T["components"]>[key]
            )
        }
    }>

    deps: ComponentMap<{
        [Mod in NonNullable<T["dependencies"]>[typeof InnerMods][number] as Mod["name"]]: {
            [key in keyof NonNullable<Mod["components"]> as `${Mod["name"] & string}_${key & string}`]: (
                NonNullable<Mod["components"]>[key]
            )
        }
    }>
}

type ExtractComponentMap<
    T extends ModData
> = ReturnType<<TMap extends ComponentMapSections<T> = ComponentMapSections<T>>() => (
    // The union with an empty object casts "ComponentMapSections"
    // type to "ComponentDeclaration".
    // Without it, typescript throws an error (not entirely sure why)
    TMap["self"] & TMap["deps"] & {}
)>

class QueryBuilder<
    TComps extends ComponentDeclaration = ComponentDeclaration,
    TTerms extends ReadonlyArray<QueryDescriptor> = readonly [],
    // starting value is the literal "unknown" so that the 
    // typescript intellisense doesn't infer string type
    // and block all predictions
    TUsedTerms extends string = "$unknown"
> implements QueryDef {
    static new<T extends ModData>() {
        return new QueryBuilder<ExtractComponentMap<T>>()
    }

    [InnerValue] = QUERY_BUILDER_EMPTY as unknown as TTerms
    private terms = <QueryTermsMeta[]>[] 

    meta(): ReadonlyArray<QueryTermsMeta> { return this.terms }

    required<
        TKey extends keyof Omit<TComps, TUsedTerms>,
        TWrite extends boolean = false
    >(
        componentKey: TKey & string,
        write: TWrite = false as TWrite
    ) {
        this.terms.push({
            key: componentKey,
            write,
            optional: false,
            without: false
        })
        return this as unknown as QueryBuilder<TComps, readonly [
            ...TTerms, 
            TWrite extends true 
                ? Struct<TComps[TKey]> 
                : Readonly<Struct<TComps[TKey]>>  
        ], TUsedTerms | (TKey & string)> 
    }

    optional<
        TKey extends keyof Omit<TComps, TUsedTerms>,
        TWrite extends boolean = false
    >(
        componentKey: TKey,
        write: TWrite = false as TWrite
    ) {
        this.terms.push({
            key: componentKey as string,
            write,
            optional: true,
            without: false
        })
        return this as unknown as QueryBuilder<TComps, readonly [
            ...TTerms, 
            TWrite extends true 
                ? Option<Struct<TComps[TKey]>> 
                : Option<Readonly<Struct<TComps[TKey]>>>  
        ], TUsedTerms | (TKey & string)>
    }

    without<
        TKey extends keyof Omit<TComps, TUsedTerms>,
    >(componentKey: TKey & string): QueryBuilder<
        TComps, TTerms, TUsedTerms | (TKey & string)
    > {
        this.terms.push({
            key: componentKey as string,
            write: false,
            optional: false,
            without: true
        })
        return this
    }

    build() { return this }
}

const ARCHETYPE_BUILDER_EMPTY = <ComponentDeclaration>{}
const EMPTY_STRUCT = <Struct>{}

class ArchetypeBuilder<
    TComps extends ComponentDeclaration = ComponentDeclaration,
    TDef extends ComponentDeclaration = {},
> implements ArchetypeDef {
    static new<T extends ModData>() {
        return new ArchetypeBuilder<ExtractComponentMap<T>>()
    }

    [InnerValue] = ARCHETYPE_BUILDER_EMPTY as TDef
    private comps = <ArchetypeCompMeta[]>[]

    meta(): ReadonlyArray<ArchetypeCompMeta> { return this.comps }

    comp<T extends keyof Omit<TComps, keyof TDef>>(
        key: T & string,
        initialValue: Struct<TComps[T]> = EMPTY_STRUCT as Struct<TComps[T]>
    ) {
        this.comps.push({key, initialValue})
        return this as unknown as ArchetypeBuilder<
            TComps,
            { [key in T]: TComps[T] } & TDef
        >
    }
}

export const def = {
    data: <
        TName extends string,
        TState extends object,
        TComponents extends ComponentDeclaration,
        TDeps extends DependentsWithBrand<ReadonlyArray<ModData>> = DependentsWithBrand<readonly []>,
    >(data: ModData<
        TName, 
        TState,
        TComponents,
        TDeps
    >) => data,

    mod: <
        TName extends string,
        TState extends object,
        TComponents extends ComponentDeclaration,
        TDeps extends DependentsWithBrand<ReadonlyArray<ModData>>,
        TQuery extends QueryRecord,
        TArchs extends ArchetypeRecord
    >(zmod: LinkableMod<
        ModData<TName, TState, TComponents, TDeps>, 
        TQuery, 
        TArchs
    >) => zmod,
    
    components: <T extends ComponentDeclaration>(component: T) => component,
    
    deps: <
        T extends ReadonlyArray<LinkableMod> = readonly []
    >(...deps: DependenciesList<{
        [index in keyof T]: T[index]["data"]
    }>) => deps as DependentsWithBrand<{
        [index in keyof T]: T[index]["data"]
    }>,
        
    query: <T extends ModData>() => QueryBuilder.new<T>(),

    arch: <T extends ModData>() => ArchetypeBuilder.new<T>(),

    modUtils<T extends ModData>() { 
        return this as {
            query: () => ReturnType<typeof QueryBuilder.new<T>>,
            arch: () => ReturnType<typeof ArchetypeBuilder.new<T>>,
        } 
    },

    f32: "f32",
    i32: "i32",
} as const

/*const a = def.mod({
    data : {
        name: "hello_world",
        components: {
            vec3: {x: "f32", y: "f32"}
        }
    }
})

const b = def.data({
    name: "herro",
    dependencies: def.deps<[typeof a]>(
        {name: "hello_world"}
    ),
    components: {
        pos: {x: "i32", y: "i32", z: "i32"}
    }
})

const query = QueryBuilder.new<typeof b>()
    .required("hello_world_vec3")
    .required("herro_pos")
    [InnerValue];

const arch = ArchetypeBuilder.new<typeof b>()
    .comp("hello_world_vec3", {x: 0, y: 0})
    .comp("herro_pos", {x: 0, y: 0, z: 0})
    [InnerValue];*/