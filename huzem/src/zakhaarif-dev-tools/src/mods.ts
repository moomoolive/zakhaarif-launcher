import type {
	EngineCore, 
	InitializedEngineCore,
	PostInitializationCore,
    ComponentFieldMeta
} from "./engine"
import type {
    ComponentDefinition,
    ComponentType
} from "./components"
import type {
    ConsoleCommandInputDeclaration,
    ParsedConsoleCommandInput,
} from "./console"

export type DependencyMetadata<
    N extends string = string
> = Readonly<{ 
    name: N,
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
    engineCore: InitializedEngineCore, 
) => State | Promise<State>

export type ImmutableResourceMap = object | undefined

export type ComponentDeclaration = {
    readonly [key: string]: ComponentDefinition
}

type ComponentQueryToken = (
    "required" | "optional" | "not"
)

export type QueryDeclaration<N extends string> = {
    readonly [key: string]: {
        readonly [innerkey in N]?: ComponentQueryToken
    }
}

export type ExtractComponentNames<
    D extends ComponentDeclaration,
    N extends string
> = (
    keyof ({ readonly [key in keyof D as `${N}_${string & key}`]: string }) 
    & string
)

export type ArchetypeComponents<
    ComponentsDef extends ComponentDeclaration = ComponentDeclaration
> = {
    readonly [key in keyof ComponentsDef]?: (
        Partial<ComponentType<ComponentsDef[key]>>
    )
}

export type ArchetypeDeclaration<
    ComponentsDef extends ComponentDeclaration = ComponentDeclaration
> = {
    readonly [key: string]: ArchetypeComponents<ComponentsDef> 
}

export type ComponentDefWithName<
    D extends ComponentDeclaration,
    N extends string
> = {
    readonly [key in keyof D as `${N}_${key & string}`]: D[key]
}

export type ModData<
    Name extends string = string,
    ImmutableResources extends ImmutableResourceMap = ImmutableResourceMap,
    State extends object = object,
    ComponentDefs extends ComponentDeclaration = ComponentDeclaration,
    Queries extends QueryDeclaration<ExtractComponentNames<ComponentDefs, Name>> = QueryDeclaration<ExtractComponentNames<ComponentDefs, Name>>,
    Archetypes extends ArchetypeDeclaration<ComponentDefWithName<ComponentDefs, Name>> = ArchetypeDeclaration<ComponentDefWithName<ComponentDefs, Name>>,
> = {
    readonly name: Name,
    readonly resources?: ImmutableResources
    readonly components?: ComponentDefs
    readonly queries?: Queries
    readonly archetypes?: Archetypes
    state?: StateEvent<State>,
}

export type ModModules = ReadonlyArray<ModData>

export type DependenciesDeclaration<
    Dependencies extends ModModules
> = Dependencies extends [] ? {
    readonly dependencies?: DependencyMetadata[]
} : {
    // generics here made with the help of these answers:
    // https://stackoverflow.com/questions/71918556/typescript-creating-object-type-from-readonly-array
    // https://stackoverflow.com/questions/71931020/creating-a-readonly-array-from-another-readonly-array
    
    readonly dependencies: {
        [index in keyof Dependencies]: (
            Dependencies[index] extends { name: string, }
                ? DependencyMetadata<
                    Dependencies[index]["name"]
                > 
                : never
        )
    }
}

export type ModDataWithDependents<
    Dependencies extends ModModules = [],
    Name extends string = string,
    ImmutableResources extends ImmutableResourceMap = ImmutableResourceMap,
    State extends object = object,
    ComponentDefs extends ComponentDeclaration = ComponentDeclaration,
    Queries extends QueryDeclaration<ExtractComponentNames<ComponentDefs, Name>> = QueryDeclaration<ExtractComponentNames<ComponentDefs, Name>>,
    Archetypes extends ArchetypeDeclaration<ComponentDefWithName<ComponentDefs, Name>> = ArchetypeDeclaration<ComponentDefWithName<ComponentDefs, Name>>
> = (
    DependenciesDeclaration<Dependencies> 
    & ModData<
        Name, 
        ImmutableResources, 
        State, 
        ComponentDefs,
        Queries,
        Archetypes
    >
)

export const modData = <LinkedMods extends ModModules = []>() => ({
    define: <
        Name extends string,
        ImmutableResources extends ImmutableResourceMap,
        State extends object,
        ComponentDefs extends ComponentDeclaration,
        Queries extends QueryDeclaration<ExtractComponentNames<ComponentDefs, Name>>,
        Archetypes extends ArchetypeDeclaration<ComponentDefWithName<ComponentDefs, Name>>
    >(zMod: ImmutableResources extends Record<string, string> | undefined 
        ? ModDataWithDependents<
            LinkedMods, 
            Name, 
            ImmutableResources,
            State,
            ComponentDefs,
            Queries,
            Archetypes
        >
        : never
    ) => zMod
})

export type EcsSystem<
    LinkedMods extends ModModules = []
> = (engine: ShaheenEngine<LinkedMods>) => void 

export type Ecs<LinkedMods extends ModModules = []> = {
    addSystem: (handler: (engine: ShaheenEngine<LinkedMods>) => void) => number,
    step: () => number
}

export type ModConsoleCommand<
    Engine extends ShaheenEngine<[]>,
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
    C extends ComponentDefinition = ComponentDefinition,
> = (
    {
        index: (i: number) => ComponentType<C>
    }
    & {
        [key in keyof C as `${key & string}Ptr`]: () => number
    }
)

export type ComponentAccessor<
    C extends ComponentDefinition = ComponentDefinition,
> = (
    {
        index: (i: number) => Readonly<ComponentType<C>>
    }
    & {
        [key in keyof C as `${key & string}Ptr`]: () => number
    }
)

export interface JsHeapRef {
    i32: Int32Array
    f32: Float32Array
    u32: Uint32Array
}

export type ComponentClass<
    C extends ComponentDefinition = ComponentDefinition
> = {
    new: (ptr: number, heapRef: JsHeapRef) => MutableComponentAccessor<C>,
    readonly def: Readonly<C>
    readonly fullname: string
    readonly id: number
    readonly name: string
    /** size of an each index in component */
    readonly sizeof: number
    readonly fields: ReadonlyArray<ComponentFieldMeta>
}

// This type is sooooo cancer.
// Basically this takes any tuple and makes an intersection
// (e.g index1 & index2 & index3 ...)
// of all it's elements
// taken from: https://stackoverflow.com/questions/74217585/how-to-merge-of-many-generic-in-typescript
export type TupleToIntersection<T extends ReadonlyArray<any>> = (
    { [I in keyof T]: (x: T[I]) => void }[number] extends 
    (x: infer I) => void ? I : never
)

export type GlobalModIndex<Mods extends ModModules = []> = {
    components: TupleToIntersection<{
        [I in keyof Mods]: Mods[I] extends 
            { name: infer N, components?: infer C}
            ? (C extends undefined ? {} : {
                [key in keyof C as `${N & string}_${key & string}`]: C[key]
            })
            : {}
    }>
} 

export type LocalModIndex<M extends ModData = ModData> = {
    state: M["state"] extends undefined ? {} : Awaited<
        ReturnType<NonNullable<M["state"]>>
    >,
    resources: M["resources"] extends undefined ? {} : { 
        readonly [key in keyof NonNullable<M["resources"]>]: string 
    }
    components: M["components"] extends undefined ? {} : NonNullable<
        M["components"]
    >
    queries: M["queries"] extends undefined ? {} : {
        readonly [key in keyof NonNullable<M["queries"]>]: QueryAccessor
    }
    archetypes: M["archetypes"] extends undefined ? {} : NonNullable<
        M["archetypes"]
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
            ComponentDefFromGlobalIndex<CKey, TGlobalIndex>
        >
    }

    useMutComponents: () => {
        [CKey in keyof TArchetype]: MutableComponentAccessor<
            ComponentDefFromGlobalIndex<CKey, TGlobalIndex>
        >
    }

    initEntity: () => ({
        [CKey in keyof TArchetype]: ComponentType<
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
            ComponentClass<TLocalIndex["components"][key]>
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

export interface ShaheenEngine<
    Mods extends ModModules = []
> extends InitializedEngineCore {    
    ecs: Ecs<Mods>
    addConsoleCommand: <
        T extends ConsoleCommandInputDeclaration
    >(command: ModConsoleCommand<ShaheenEngine<Mods>, T>) => void,
    useMod: () => ({
        [Mod in Mods[number] as Mod["name"]]: ModAccessor<
            GlobalModIndex<Mods>,
            LocalModIndex<Mod>
        >
    })
}

export type BeforeGameLoopEvent<Mods extends ModModules> = (
    engine: ShaheenEngine<Mods>
) => Promise<void> | void

export type InitEvent = (
    metadata: ModMetadata,
    engineCore: EngineCore, 
) => Promise<Partial<PostInitializationCore> | void> | Partial<PostInitializationCore> | void

export type ExitEvent<
    LinkedMods extends ModModules
> = BeforeGameLoopEvent<LinkedMods>

export type ModLifeCycleEvents<LinkedMods extends ModModules> = {
    onInit?: InitEvent
    
    onBeforeGameLoop?: BeforeGameLoopEvent<LinkedMods>
    
    onExit?: ExitEvent<LinkedMods>,
}

export type CompleteMod<LinkedMods extends ModModules> = (
    ModLifeCycleEvents<LinkedMods> & {}
)

export type ExtractMods<M> = (
    M extends ModDataWithDependents<
        infer Dependencies,
        infer Name,
        infer ImmutableResources,
        infer State,
        infer ComponentDefs,
        infer Queries,
        infer Archetypes
    >  
        ? [
            ...Dependencies, 
            ModData<
                Name, 
                ImmutableResources, 
                State, 
                ComponentDefs, 
                Queries,
                Archetypes
            >
        ]
        : never
)

export type LinkableMod<
    Mod extends ModDataWithDependents = ModDataWithDependents
> = (
    { data: Mod } 
    & CompleteMod<ExtractMods<Mod>>
)

export const initMod = <M extends ModDataWithDependents>(mod: LinkableMod<M>) => mod

type AllUtils<Mods extends ModModules> = (
    Required<ModLifeCycleEvents<Mods>>
    & {
        Engine: ShaheenEngine<Mods>,
        System: (engine: ShaheenEngine<Mods>) => void
    }
)

export type Zutils<Mod extends ModDataWithDependents> = AllUtils<ExtractMods<Mod>>

export type ModEsModule = {
    mod: LinkableMod
}