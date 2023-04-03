import type {
	EngineCore, 
	InitializedEngineCore,
	PostInitializationCore,
} from "./engine"
import type {
    ComponentDefinition
} from "./components"

export type ModMetadata = Readonly<{
    canonicalUrl: string
    resolvedUrl: string
    name: string,
    dependencies: string[]
}>

export type StateEvent<State extends object> = (
    metadata: ModMetadata,
    engineCore: InitializedEngineCore, 
) => State | Promise<State>

type ImmutableResourceMap = object | undefined

export type ComponentDeclaration = {
    readonly [key: string]: ComponentDefinition
}

export type ModData<
    Name extends string,
    ImmutableResources extends ImmutableResourceMap,
    State extends object,
    ComponentDefs extends ComponentDeclaration
> = {
    readonly name: Name,
    readonly resources?: ImmutableResources
    readonly components?: ComponentDefs
    state?: StateEvent<State>
}

export type GenericModData = ModData<
    string, 
    ImmutableResourceMap, 
    object,
    {}
>

export type ModModules = ReadonlyArray<GenericModData>

type ModStateIndex<EngineModules extends ModModules> = {
    [mod in EngineModules[number] as mod["name"]]: (
        mod["state"] extends undefined 
            ? {}
            : Awaited<ReturnType<NonNullable<mod["state"]>>>
    )
}

type ModResourceIndex<EngineModules extends ModModules> = {
    [mod in EngineModules[number] as mod["name"]]: (
        mod["resources"] extends undefined ? {} : { 
            readonly [key in keyof NonNullable<mod["resources"]>]: string 
        }
    )
}

type ModMetadataIndex<EngineModules extends ModModules> = {
    [mod in EngineModules[number] as mod["name"]]: ModMetadata
}

export type EngineLinkedMods<
    EngineModules extends ModModules
> = {
    state: () => ModStateIndex<EngineModules>
    resouces: () => ModResourceIndex<EngineModules>
    metadata: () => ModMetadataIndex<EngineModules>
}

export type DependenciesDeclaration<
    Dependencies extends ModModules
> = Dependencies extends [] ? {
    readonly dependencies?: string[]
} : {
    // generics here made with the help of these answers:
    // https://stackoverflow.com/questions/71918556/typescript-creating-object-type-from-readonly-array
    // https://stackoverflow.com/questions/71931020/creating-a-readonly-array-from-another-readonly-array
    
    readonly dependencies: {
        [index in keyof Dependencies]: Dependencies[index] extends { name: string }
            ? Dependencies[index]["name"]
            : never
    }
}

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
        addConsoleCommand: <
            T extends ConsoleCommandInputDeclaration
        >(command: ModConsoleCommand<ShaheenEngine<LinkedMods>, T>) => void
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

export type ExitEvent<
    LinkedMods extends ModModules
> = BeforeGameLoopEvent<LinkedMods>

export type ModLifeCycleEvents<LinkedMods extends ModModules> = {
    onInit?: InitEvent
    
    onBeforeGameLoop?: BeforeGameLoopEvent<LinkedMods>
    
    onExit?: ExitEvent<LinkedMods>,
}

export type ConsoleArgNumber = "number"
export type ConsoleArgOptionalNumber = "number?"
export type ConsoleArgBool = "boolean"
export type ConsoleArgOptionalBool = "boolean?"
export type ConsoleArgString = "string"
export type ConsoleArgOptionalString = "string?"

export type ConsoleArgType = (
    ConsoleArgBool
    | ConsoleArgOptionalBool
    | ConsoleArgNumber
    | ConsoleArgOptionalNumber
    | ConsoleArgOptionalString
    | ConsoleArgString
)

export type ConsoleParsedArg<T extends ConsoleArgType> = (
    T extends "number"
    ? number
    : T extends "number?"
    ? number | undefined
    : T extends "boolean" 
    ? boolean
    : T extends "boolean?"
    ? boolean | undefined
    : T extends "string"
    ? string
    : T extends "string?"
    ? string | undefined
    : never 
)

export type ConsoleCommandInputDeclaration = {
    readonly [key: string]: ConsoleArgType
}

export type ParsedConsoleCommandInput<
    Input extends ConsoleCommandInputDeclaration
> = {
    [key in keyof Input]: ConsoleParsedArg<Input[key]>
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

export type CompleteMod<LinkedMods extends ModModules> = (
    ModLifeCycleEvents<LinkedMods> & {
        
    }
)

export type ModDataWithDependents<
    Dependencies extends ModModules,
    Name extends string,
    ImmutableResources extends ImmutableResourceMap,
    State extends object,
    ComponentDefs extends ComponentDeclaration,
> = (
    DependenciesDeclaration<Dependencies> 
    & ModData<Name, ImmutableResources, State, ComponentDefs>
)

export const modData = <LinkedMods extends ModModules = []>() => ({
    define: <
        Name extends string,
        ImmutableResources extends ImmutableResourceMap,
        State extends object,
        ComponentDefs extends ComponentDeclaration,
    >(zMod: ImmutableResources extends Record<string, string> | undefined 
        ? ModDataWithDependents<
            LinkedMods, 
            Name, 
            ImmutableResources,
            State,
            ComponentDefs
        >
        : never
    ) => zMod
})

type LinkableMod<Data> = (
    Data extends ModDataWithDependents<
        infer Dep,
        infer Name,
        infer ImmutableResources,
        infer State,
        infer ComponentDefs
    >  
        ? ({
            data: Data
        } & CompleteMod<[
            ...Dep, 
            ModData<Name, ImmutableResources, State, ComponentDefs>
        ]>)
        : never
)

type EmptyMod = ModDataWithDependents<
    [], 
    string, 
    ImmutableResourceMap,
    object,
    {}
>

export const initMod = <Data extends EmptyMod>(mod: LinkableMod<Data>) => mod

type GenericMod = LinkableMod<
    ModDataWithDependents<
        [], 
        string, 
        ImmutableResourceMap,
        object,
        {}
    >
>
export type ModModule<ExportedMod extends GenericMod = GenericMod> = {
    mod: ExportedMod
}

type AllUtils<Dependencies extends ModModules> = {
    Engine: ShaheenEngine<Dependencies>,
    System: (engine: ShaheenEngine<Dependencies>) => void

    // events
    BeforeGameLoopHandler: BeforeGameLoopEvent<Dependencies> 
    ExitHandler: ExitEvent<Dependencies> 
}

export type Zutils<CurrentMod> = (
    CurrentMod extends ModDataWithDependents<
        infer Dep,
        infer Name,
        infer ImmutableResources,
        infer State,
        infer ComponentDefs
    > 
        ? AllUtils<[
            ...Dep, 
            ModData<Name, ImmutableResources, State, ComponentDefs>
        ]>
        : never
)
