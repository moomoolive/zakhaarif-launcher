import type {
	EngineCore, 
	InitializedEngineCore,
	PostInitializationCore
} from "./engine"

export type ModMetadata = Readonly<{
    canonicalUrl: string
    resolvedUrl: string
    alias: string,
    dependencies: string[]
}>

export type StateEvent<State extends object> = (
    metadata: ModMetadata,
    engineCore: InitializedEngineCore, 
) => State | Promise<State>

type ImmutableResourceMap = object | undefined

export type ModData<
    Alias extends string,
    ImmutableResources extends ImmutableResourceMap,
    State extends object
> = {
    readonly alias: Alias,
    readonly resources?: ImmutableResources
    state?: StateEvent<State>
}

export type GenericModData = ModData<string, ImmutableResourceMap, object>

export type ModModules = ReadonlyArray<GenericModData>

type ModStateIndex<EngineModules extends ModModules> = {
    [mod in EngineModules[number] as mod["alias"]]: (
        mod["state"] extends undefined 
            ? {}
            : Awaited<ReturnType<NonNullable<mod["state"]>>>
    )
}

type ModResourceIndex<EngineModules extends ModModules> = {
    [mod in EngineModules[number] as mod["alias"]]: (
        mod["resources"] extends undefined ? {} : { 
            readonly [key in keyof NonNullable<mod["resources"]>]: string 
        }
    )
}

type ModMetadataIndex<EngineModules extends ModModules> = {
    [mod in EngineModules[number] as mod["alias"]]: ModMetadata
}

export type EngineLinkedMods<
    EngineModules extends ModModules
> = {
    state: () => ModStateIndex<EngineModules>
    resouces: () => ModResourceIndex<EngineModules>
    metadata: () => ModMetadataIndex<EngineModules>
}

export interface ModExtensions {}

export type DependenciesDeclaration<
    Dependencies extends ModModules
> = Dependencies extends [] ? {
    readonly dependencies?: string[]
} : {
    // generics here made with the help of these answers:
    // https://stackoverflow.com/questions/71918556/typescript-creating-object-type-from-readonly-array
    // https://stackoverflow.com/questions/71931020/creating-a-readonly-array-from-another-readonly-array
    
    readonly dependencies: {
        [index in keyof Dependencies]: Dependencies[index] extends { alias: string }
            ? Dependencies[index]["alias"]
            : never
    }
}

export type ModDeclaration<
    Dependencies extends ModModules,
    Alias extends string,
    ImmutableResources extends ImmutableResourceMap,
    State extends object
> = (
    DependenciesDeclaration<Dependencies> 
    & ModData<Alias, ImmutableResources, State>
)

export type EcsSystem<
    LinkedMods extends ModModules
> = (engine: ShaheenEngine<LinkedMods>) => void 

export type Ecs<LinkedMods extends ModModules> = {
    addSystem: (handler: (engine: ShaheenEngine<LinkedMods>) => void) => number,
    step: () => number
}

export type ShaheenEngine<LinkedMods extends ModModules> = (
    EngineLinkedMods<LinkedMods>
    & InitializedEngineCore
    & {
        ecs: Ecs<LinkedMods>
    }
)

export type EnginePrimitives = Partial<PostInitializationCore>

export type BeforeGameLoopEvent<
    LinkedMods extends ModModules,
> = (engine: ShaheenEngine<LinkedMods>) => Promise<void> | void

export type InitEvent = (
    metadata: ModMetadata,
    engineCore: EngineCore, 
) => Promise<EnginePrimitives | void> | EnginePrimitives | void

export type ExitEvent<LinkedMods extends ModModules> = BeforeGameLoopEvent<LinkedMods>

export type ModLifeCycleEvents<
    Dependencies extends ModModules,
    Alias extends string,
    ImmutableResources extends ImmutableResourceMap,
    State extends object
> = {
    onInit?: InitEvent
    
    onBeforeGameLoop?: BeforeGameLoopEvent<[
        ...Dependencies, 
        ModData<Alias, ImmutableResources, State>
    ]>
    
    onExit?: ExitEvent<[
        ...Dependencies, 
        ModData<Alias, ImmutableResources, State>
    ]>,
}


export type Mod<
    Dependencies extends ModModules,
    Alias extends string,
    ImmutableResources extends ImmutableResourceMap,
    State extends object
> = (
    ModDeclaration<Dependencies, Alias, ImmutableResources, State>
    & ModLifeCycleEvents<Dependencies, Alias, ImmutableResources, State>
    & ModExtensions
)

export const mod = <
    Dependencies extends ModModules = []
>() => ({
		create: <
        Alias extends string,
        ImmutableResources extends ImmutableResourceMap,
        State extends object
    >(zMod: ImmutableResources extends Record<string, string> | undefined 
        ? Mod<
            Dependencies, 
            Alias, 
            ImmutableResources,
            State
        >
        : never
    ) => zMod
	})

export type GenericMod = Mod<
    [], 
    string, 
    ImmutableResourceMap,
    object
>

export type ModModule<ExportedMod extends GenericMod = GenericMod> = {
    default: ExportedMod
}

// utility types
export type InferEngine<CurrentMod> = ( 
    CurrentMod extends Mod<
        infer Dep,
        infer Alias,
        infer ImmutableResources,
        infer State
    > 
        ? ShaheenEngine<[
            ...Dep, 
            ModData<Alias, ImmutableResources, State>
        ]> 
        : never
)

export type InferGameSystem<CurrentMod> = ( 
    CurrentMod extends Mod<
        infer Dep,
        infer Alias,
        infer ImmutableResources,
        infer State
    > 
        ? (engine: ShaheenEngine<[
            ...Dep, 
            ModData<Alias, ImmutableResources, State>
        ]>) => void
        : never
)

export type InferBeforeGameLoopEvent<CurrentMod> = ( 
    CurrentMod extends Mod<
        infer Dep,
        infer Alias,
        infer ImmutableResources,
        infer State
    > 
        ? BeforeGameLoopEvent<[
            ...Dep, 
            ModData<Alias, ImmutableResources, State>
        ]> 
        : never
)

export type InferExitEvent<CurrentMod> = (
    InferBeforeGameLoopEvent<CurrentMod>
)