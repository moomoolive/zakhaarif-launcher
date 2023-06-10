import type {
	MainThreadEngineCore,
    ConsoleCommandIndex
} from "./engine"
import type {
    ComponentDefinition,
    Struct
} from "./components"
import type {
    ConsoleCommandInputDeclaration,
    ParsedConsoleCommandInput,
} from "./console"
import {InnerMods, InnerValue} from "./symbols"

export type DependencyMetadata<T extends string = string> = Readonly<{ 
    name: T,
    type?: "required" | "optional"
    version?: string
}>

export type ModMetadata = Readonly<{
    canonicalUrl: string
    resolvedUrl: string
    name: string,
    dependencies: DependencyMetadata[]
    id: number
}>

export type ComponentDeclaration = {
    readonly [key: string]: ComponentDefinition
}

export type DependenciesList<
    T extends ReadonlyArray<{ readonly name: string }>
> = ({
    // generics here made with the help of these answers:
    // https://stackoverflow.com/questions/71918556/typescript-creating-object-type-from-readonly-array
    // https://stackoverflow.com/questions/71931020/creating-a-readonly-array-from-another-readonly-array
    [index in keyof T]: (
        T[index] extends { readonly name: string } 
            ? DependencyMetadata<T[index]["name"]> 
            : never
    )
})

export type DependentsWithBrand<
    T extends ReadonlyArray<{ readonly name: string }>
> = (
    DependenciesList<T> & { readonly [InnerMods]: T }
)

export type ModData<
    TName extends string = string,
    TState extends object = object,
    TComponentDefs extends ComponentDeclaration = ComponentDeclaration,
    TDeps extends DependentsWithBrand<ReadonlyArray<ModData>> = DependentsWithBrand<ReadonlyArray<any>>
> = {
    readonly name: TName,
    readonly dependencies?: TDeps
    readonly components?: TComponentDefs
    readonly state?: (
        metadata: ModMetadata,
        engineCore: MainThreadEngineCore, 
    ) => TState | Promise<TState>    
}

export type ModConsoleCommand<
    Engine extends MainThreadEngine<[]>,
    CommandArgs extends ConsoleCommandInputDeclaration
>  = {
    name: string
    args?: CommandArgs
    fn: (
        engine: Engine,
        parsedInput: ParsedConsoleCommandInput<CommandArgs>,
    ) => unknown
}

export type DeepReadonly<T> = {
    readonly [key in keyof T]: (
        T[key] extends Array<infer E>
            ? ReadonlyArray<DeepReadonly<E>>
            : T[key] extends object
                ? DeepReadonly<T[key]>
                : T[key]
    )
}

type LocalModIndex<T extends ModCore = ModCore> = {
    state: T["data"]["state"] extends undefined 
        ? {}
        : Awaited<ReturnType<NonNullable<T["data"]["state"]>>>,
    
    components: T["data"]["components"] extends undefined 
        ? {} 
        : NonNullable<T["data"]["components"]>

    qs: T["queries"] extends undefined 
        ? {} 
        : NonNullable<T["queries"]>
    
    archetypes: T["archetypes"] extends undefined 
        ? {} 
        : NonNullable<T["archetypes"]>
}

export interface ModAccessor<
    T extends LocalModIndex = LocalModIndex,
> {
    readonly queries: {
        readonly [query in keyof T["qs"]]: {
            readonly id: number
            readonly modId: number
            readonly name: string
            readonly iter: () => {
                readonly [Symbol.iterator]: () => {
                    readonly next: () => {
                        done: boolean
                        value: T["qs"][query][typeof InnerValue]
                    }
                }
            }
        }
    }
    readonly meta: ModMetadata
    readonly comps: {
        readonly [key in keyof T["components"]]: number
    }
    readonly archs: {
        readonly [key in keyof T["archetypes"]]: Readonly<{
            readonly id: number
            readonly modId: number
            readonly name: string
            /** returns the amount of memory (bytes) a single entity consumes */
            sizeOfEntity: () => number
            /** the number of entities currently being held in archetype */
            entityCount: () => number
            /** the number of entities that can be held before component buffers need to be resized */
            entityCapacity: () => number
            componentCount: () => number
        }>
    }

    mutState: () => T["state"]
    state: () => DeepReadonly<T["state"]>
}

export interface OptionAccessor<TValue, TSome extends boolean> {
    readonly isSome: () => this is OptionAccessor<TValue, true>
    readonly unwrap: TSome extends true ? () => TValue : undefined
    readonly isNone: () => this is OptionAccessor<TValue, false>
}

export interface Some<T>  extends OptionAccessor<T, true> {}

export interface None extends OptionAccessor<undefined, false> {}

export type Option<T> = Some<T> | None

export type QueryDescriptor = (
    Struct | Option<Struct>
    | Readonly<Struct> | Option<Readonly<Struct>>
)

export type QueryTermsMeta = Readonly<{
    key: string, 
    write: boolean, 
    optional: boolean, 
    without: boolean
}>

export type QueryDef = Readonly<{
    [InnerValue]: ReadonlyArray<QueryDescriptor>
    meta: () => ReadonlyArray<QueryTermsMeta>
}>

export type QueryRecord = { 
    readonly [key: string]: QueryDef
}

export type ArchetypeCompMeta = Readonly<{
    key: string
    initialValue: Record<string, number> 
}>

export type ArchetypeDef = Readonly<{
    [InnerValue]: ComponentDeclaration
    meta: () => ReadonlyArray<ArchetypeCompMeta>
}>

export type ArchetypeRecord = {
    readonly [key: string]: ArchetypeDef
}

export type ModCore<
    TData extends ModData = ModData,
    TQueries extends QueryRecord = QueryRecord,
    TArchs extends ArchetypeRecord = ArchetypeRecord
> = { 
    readonly data: TData
    readonly queries?: TQueries
    readonly archetypes?: TArchs
}

export type ModModules = ReadonlyArray<ModCore>

export type EcsSystem<T extends ModModules = []> = (
    (engine: MainThreadEngine<T>) => void 
)

export interface MainThreadEngine<
    T extends ModModules = []
> extends MainThreadEngineCore {
    readonly systems: Readonly<{
        add: (handler: EcsSystem<T>) => number,
    }>
    readonly devConsole: Readonly<{
        index: ConsoleCommandIndex,
        addCommand: <
            TDef extends ConsoleCommandInputDeclaration
        >(command: ModConsoleCommand<MainThreadEngine<T>, TDef>) => void
    }>
    readonly mods: {
        [Mod in T[number] as Mod["data"]["name"]]: ModAccessor<
            LocalModIndex<Mod>
        >
    }
}

export type ModLifeCycleEvents<T extends ModModules> = Readonly<{
    onInit?: (metadata: ModMetadata, engineCore: MainThreadEngineCore) => Promise<void> | void
    onBeforeLoop?: (engine: MainThreadEngine<T>) => Promise<void> | void
    onExit?: (engine: MainThreadEngine<T>) => Promise<void> | void
}>

export type LinkableMod<
    TData extends ModData = ModData,
    TQueries extends QueryRecord = QueryRecord,
    TArchs extends ArchetypeRecord = ArchetypeRecord
> = (
    ModCore<TData, TQueries, TArchs> 
    & ModLifeCycleEvents<[
        ModCore<TData, TQueries, TArchs>, 
        ...NonNullable<TData["dependencies"]>[typeof InnerMods]
    ]>
)