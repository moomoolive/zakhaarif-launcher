import type {
	MainThreadEngineCore,
    ComponentFieldMeta,
    JsHeapRef,
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

export type DependencyMetadata<
    T extends string = string
> = Readonly<{ 
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

export type StateEvent<State extends object> = (
    metadata: ModMetadata,
    engineCore: MainThreadEngineCore, 
) => State | Promise<State>

export type ImmutableResourceMap = object | undefined

export type ComponentDeclaration = {
    readonly [key: string]: ComponentDefinition
}

type ComponentQueryToken = (
    "required" | "optional" | "not"
)

export type QueryDeclaration<T extends string> = {
    readonly [key: string]: {
        readonly [innerkey in T]?: ComponentQueryToken
    }
}

export type ExtractModComponentNames<
    TComponents extends ComponentDeclaration,
    TModName extends string
> = (
    keyof ({ readonly [key in keyof TComponents as `${TModName}_${string & key}`]: string }) 
    & string
)

export type ArchetypeComponents<
    T extends ComponentDeclaration = ComponentDeclaration
> = {
    readonly [key in keyof T]?: Partial<
        Struct<key & string, T[key]>
    >
}

export type ArchetypeDeclaration<
    T extends ComponentDeclaration = ComponentDeclaration
> = {
    readonly [key: string]: ArchetypeComponents<T> 
}

export type ComponentDefWithName<
    TComponents extends ComponentDeclaration,
    TModName extends string
> = {
    readonly [key in keyof TComponents as `${TModName}_${key & string}`]: TComponents[key]
}

export type ModData<
    TName extends string = string,
    TImmutableResources extends ImmutableResourceMap = ImmutableResourceMap,
    TState extends object = object,
    TComponentDefs extends ComponentDeclaration = ComponentDeclaration,
    TQueries extends QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>> = QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>>,
    TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>> = ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>>,
> = {
    readonly name: TName,
    readonly resources?: TImmutableResources
    readonly components?: TComponentDefs
    readonly queries?: TQueries
    readonly archetypes?: TArchetypes
    jsState?: StateEvent<TState>,
}

export type ModModules = ReadonlyArray<ModData>

export type DependenciesDeclaration<
    T extends ModModules
> = T extends [] ? {
    readonly dependencies?: DependencyMetadata[]
} : {
    // generics here made with the help of these answers:
    // https://stackoverflow.com/questions/71918556/typescript-creating-object-type-from-readonly-array
    // https://stackoverflow.com/questions/71931020/creating-a-readonly-array-from-another-readonly-array
    readonly dependencies: {
        [index in keyof T]: (
            T[index] extends { name: string, }
                ? DependencyMetadata<
                    T[index]["name"]
                > 
                : never
        )
    }
}

export type ModDataWithDependents<
    TDependencies extends ModModules = [],
    TName extends string = string,
    TImmutableResources extends ImmutableResourceMap = ImmutableResourceMap,
    TState extends object = object,
    TComponentDefs extends ComponentDeclaration = ComponentDeclaration,
    TQueries extends QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>> = QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>>,
    TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>> = ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>>
> = (
    DependenciesDeclaration<TDependencies> 
    & ModData<
        TName, 
        TImmutableResources, 
        TState, 
        TComponentDefs,
        TQueries,
        TArchetypes
    >
)

export const modData = <TLinkedMods extends ModModules = []>() => ({
    define: <
        TName extends string,
        TImmutableResources extends ImmutableResourceMap,
        TState extends object,
        TComponentDefs extends ComponentDeclaration,
        TQueries extends QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>>,
        TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>>
    >(zMod: TImmutableResources extends Record<string, string> | undefined 
        ? ModDataWithDependents<
            TLinkedMods, 
            TName, 
            TImmutableResources,
            TState,
            TComponentDefs,
            TQueries,
            TArchetypes
        >
        : never
    ) => zMod
})

export type EcsSystem<T extends ModModules = []> = (
    (engine: MainThreadEngine<T>) => void 
)

export type EcsSystemManager<T extends ModModules = []> = Readonly<{
    add: (handler: (engine: MainThreadEngine<T>) => void) => number,
}>

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

export type QueryAccessor = () => {}

export type DeepReadonly<T> = {
    readonly [key in keyof T]: (
        T[key] extends Array<infer E>
            ? ReadonlyArray<DeepReadonly<E>>
            : T[key] extends object
                ? DeepReadonly<T[key]>
                : T[key]
    )
}

export type MutableComponentAccessor<
    TName extends string = string,
    TDef extends ComponentDefinition = ComponentDefinition,
> = (
    {
        index: (i: number) => Struct<TName, TDef>
    }
    & {
        [key in keyof TDef as `${key & string}Ptr`]: () => number
    }
)

export type ComponentAccessor<
    TName extends string = string,
    TDef extends ComponentDefinition = ComponentDefinition,
> = (
    {
        index: (i: number) => Readonly<Struct<TName, TDef>>
    }
    & {
        [key in keyof TDef as `${key & string}Ptr`]: () => number
    }
)

export type ComponentClass<
    TName extends string = string,
    TDefinition extends ComponentDefinition = ComponentDefinition
> = {
    new: (ptr: number, heapRef: JsHeapRef) => MutableComponentAccessor<TName, TDefinition>,
    readonly def: Readonly<TDefinition>
    readonly fullname: string
    readonly id: number
    readonly name: string
    /** size of an each index in component */
    readonly sizeof: number
    readonly fields: ReadonlyArray<ComponentFieldMeta>
}

// This type is sooooo cancer.
// Basically this takes any tuple and makes an intersection
// (e.g index1 & index2 & index3 ...) of all it's elements
// taken from: https://stackoverflow.com/questions/74217585/how-to-merge-of-many-generic-in-typescript
export type TupleToIntersection<T extends ReadonlyArray<any>> = (
    { [I in keyof T]: (x: T[I]) => void }[number] extends 
    (x: infer I) => void ? I : never
)

export type GlobalModIndex<T extends ModModules = []> = {
    components: TupleToIntersection<{
        [index in keyof T]: T[index] extends 
            { name: infer TName, components?: infer TComponents }
            ? (TComponents extends undefined ? {} : {
                [key in keyof TComponents as `${TName & string}_${key & string}`]: TComponents[key]
            })
            : {}
    }>
} 

export type LocalModIndex<T extends ModData = ModData> = {
    state: T["jsState"] extends undefined ? {} : Awaited<
        ReturnType<NonNullable<T["jsState"]>>
    >,
    resources: T["resources"] extends undefined ? {} : { 
        readonly [key in keyof NonNullable<T["resources"]>]: string 
    }
    components: T["components"] extends undefined ? {} : NonNullable<
        T["components"]
    >
    queries: T["queries"] extends undefined ? {} : {
        readonly [key in keyof NonNullable<T["queries"]>]: QueryAccessor
    }
    archetypes: T["archetypes"] extends undefined ? {} : NonNullable<
        T["archetypes"]
    >
}

export type ComponentDefFromGlobalIndex<
    TName extends PropertyKey = PropertyKey,
    TGlobalIndex extends GlobalModIndex = GlobalModIndex
> = (
    TName extends keyof TGlobalIndex["components"]
        ? TGlobalIndex["components"][TName] extends ComponentDefinition
            ? TGlobalIndex["components"][TName]
            : {}
        : {}
)

export interface ArchetypeAccessor<
    TArchetype extends ArchetypeComponents = ArchetypeComponents,
    TGlobalIndex extends GlobalModIndex = GlobalModIndex
> {
    id: () => number
        
    /** returns the amount of memory (bytes) a single entity consumes */
    sizeOfEntity: () => number
    /** the number of entities currently being held in archetype */
    entityCount: () => number
    /** the number of entities that can be held before component buffers need to be resized */
    entityCapacity: () => number

    useComponents: () => {
        [CKey in keyof TArchetype]: ComponentAccessor<
            CKey & string,
            ComponentDefFromGlobalIndex<CKey, TGlobalIndex>
        >
    }

    useMutComponents: () => {
        [CKey in keyof TArchetype]: MutableComponentAccessor<
            CKey & string,
            ComponentDefFromGlobalIndex<CKey, TGlobalIndex>
        >
    }

    initEntity: () => ({
        [CKey in keyof TArchetype]: Struct<
            CKey & string,
            ComponentDefFromGlobalIndex<CKey, TGlobalIndex>
        >
    } & {
        create: () => number
    }),
}

export interface ModAccessor<
    TGlobalIndex extends GlobalModIndex = GlobalModIndex,
    TLocalIndex extends LocalModIndex = LocalModIndex
> {
    useMutState: () => TLocalIndex["state"]
    useState: () => DeepReadonly<TLocalIndex["state"]>
    useQuery: () => TLocalIndex["queries"] 
    useMetadata: () => ModMetadata,
    useResource: () => TLocalIndex["resources"],
    useComponent: () => ({
        readonly [key in keyof TLocalIndex["components"]]: (
            ComponentClass<
                key & string,
                TLocalIndex["components"][key]
            >
        )
    })
    useArchetype: () => ({
        readonly [key in keyof TLocalIndex["archetypes"]]: (
            ArchetypeAccessor<
                TLocalIndex["archetypes"][key], TGlobalIndex
            > 
        )
    })
}

export type ConsoleCommandManager<
    TMods extends ModModules = []
> = Readonly<{
    index: ConsoleCommandIndex,
    addCommand: <
        TDef extends ConsoleCommandInputDeclaration
    >(command: ModConsoleCommand<MainThreadEngine<TMods>, TDef>) => void
}>

export interface MainThreadEngine<T extends ModModules = []> extends MainThreadEngineCore {
    readonly systems: EcsSystemManager<T>
    readonly devConsole: ConsoleCommandManager<T>
    readonly mods: {
        [Mod in T[number] as Mod["name"]]: ModAccessor<
            GlobalModIndex<T>,
            LocalModIndex<Mod>
        >
    }
}

export type BeforeGameLoopEvent<T extends ModModules> = (
    engine: MainThreadEngine<T>
) => Promise<void> | void

export type InitEvent = (
    metadata: ModMetadata,
    engineCore: MainThreadEngineCore, 
) => Promise<void> | void

export type ExitEvent<T extends ModModules> = BeforeGameLoopEvent<T>

export type ModLifeCycleEvents<T extends ModModules> = {
    onInit?: InitEvent
    onBeforeGameLoop?: BeforeGameLoopEvent<T>
    onExit?: ExitEvent<T>,
}

export type CompleteMod<T extends ModModules> = (
    ModLifeCycleEvents<T> & {}
)

export type ExtractMods<TMod> = (
    TMod extends ModDataWithDependents<
        infer TDependencies,
        infer TName,
        infer TImmutableResources,
        infer TState,
        infer TComponentDefs,
        infer TQueries,
        infer TArchetypes
    >  
        ? [
            ...TDependencies, 
            ModData<
                TName, 
                TImmutableResources, 
                TState, 
                TComponentDefs, 
                TQueries,
                TArchetypes
            >
        ]
        : never
)

export type LinkableMod<
    T extends ModDataWithDependents = ModDataWithDependents
> = (
    { data: T } 
    & CompleteMod<ExtractMods<T>>
)

export const initMod = <T extends ModDataWithDependents>(mod: LinkableMod<T>) => mod

type AllUtils<T extends ModModules> = (
    Required<ModLifeCycleEvents<T>>
    & {
        Engine: MainThreadEngine<T>,
        System: (engine: MainThreadEngine<T>) => void
    }
)

export type Zutils<T extends ModDataWithDependents> = AllUtils<ExtractMods<T>>

export type ModEsModule = {
    mod: LinkableMod
}