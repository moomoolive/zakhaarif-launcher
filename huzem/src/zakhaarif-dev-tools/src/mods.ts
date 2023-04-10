import type {
	EngineCore, 
	InitializedEngineCore,
	PostInitializationCore,
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
    keyof ({ readonly [key in keyof D as `${N}.${string & key}`]: string }) 
    & string
)

export type ArchetypeDeclaration<
    ComponentsDef extends ComponentDeclaration
> = {
    readonly [key: string]: {
        readonly [innerkey in keyof ComponentsDef]?: (
            Partial<ComponentType<ComponentsDef[innerkey]>>
        )
    }
}

export type ComponentDefWithName<
    D extends ComponentDeclaration,
    N extends string
> = {
    readonly [key in keyof D as `${N}.${key & string}`]: D[key]
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
    new (ptr: number, heapRef: JsHeapRef): MutableComponentAccessor<C>,
    readonly def: Readonly<C>
    readonly fullname: string
    readonly id: number
}

export interface ModAccessor<
    S extends object = object,
    R extends Record<string, string> = Record<string, string>,
    C extends ComponentDeclaration = ComponentDeclaration,
    Q extends Record<string, QueryAccessor> = Record<string, QueryAccessor>,
    A extends ArchetypeDeclaration<{}> = ArchetypeDeclaration<{}>
> {
    useMutState: () => S
    useState: () => DeepReadonly<S>
    useQuery: () => Q 
    useMetadata: () => ModMetadata,
    useResource: () => R,
    useComponent: () => ({
        readonly [key in keyof C]: ComponentClass<C[key]>
    })
    useArchetype: () => object
}

export interface ShaheenEngine<
    Mods extends ModModules = []
> extends InitializedEngineCore {    
    ecs: Ecs<Mods>
    addConsoleCommand: <
        T extends ConsoleCommandInputDeclaration
    >(command: ModConsoleCommand<ShaheenEngine<Mods>, T>) => void,
    useMod: () => ({
        [mod in Mods[number] as mod["name"]]: ModAccessor<
            (
                mod["state"] extends undefined ? {} : Awaited<
                    ReturnType<NonNullable<mod["state"]>>
                >
            ),
            (
                mod["resources"] extends undefined ? {} : { 
                    readonly [key in keyof NonNullable<mod["resources"]>]: string 
                }
            ),
            (
                mod["components"] extends undefined ? {} : NonNullable<mod["components"]>
            ),
            (
                mod["queries"] extends undefined ? {} : {
                    readonly [key in keyof NonNullable<mod["queries"]>]: QueryAccessor
                }
            ),
            (
                mod["archetypes"] extends undefined ? {} : NonNullable<mod["archetypes"]>
            )
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