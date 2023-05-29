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
import {InnerMods} from "./symbols"

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

export type QueryDeclaration<T extends string> = {
    readonly [key: string]: {
        readonly [innerkey in T]?: (
            "required" | "optional" | "without"
        )
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

export type ModModules = ReadonlyArray<ModData>

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
    TQueries extends QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>> = QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>>,
    TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>> = ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>>,
    TDeps extends DependentsWithBrand<ReadonlyArray<ModData>> = DependentsWithBrand<ReadonlyArray<any>>
> = {
    readonly name: TName,
    readonly dependencies?: TDeps
    readonly components?: TComponentDefs
    state?: (
        metadata: ModMetadata,
        engineCore: MainThreadEngineCore, 
    ) => TState | Promise<TState>
    
    readonly queries?: TQueries
    readonly archetypes?: TArchetypes
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

// This type is sooooo cancer.
// Basically this takes any tuple and makes an intersection
// (e.g index1 & index2 & index3 ...) of all it's elements
// taken from: https://stackoverflow.com/questions/74217585/how-to-merge-of-many-generic-in-typescript
type TupleToIntersection<T extends ReadonlyArray<any>> = (
    { [I in keyof T]: (x: T[I]) => void }[number] extends 
    (x: infer I) => void ? I : never
)

type GlobalModIndex<T extends ModModules = []> = {
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
    state: T["state"] extends undefined ? {} : Awaited<
        ReturnType<NonNullable<T["state"]>>
    >,
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

export interface ModAccessor<
    T extends LocalModIndex = LocalModIndex
> {
    readonly queries: T["queries"] 
    readonly meta: ModMetadata
    readonly comps: {
        readonly [key in keyof T["components"]]: number
    }
    readonly archs: {
        readonly [key in keyof T["archetypes"]]: {
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
        } 
    }

    mutState: () => T["state"]
    state: () => DeepReadonly<T["state"]>
}

export type EcsSystem<T extends ModModules = []> = (
    (engine: MainThreadEngine<T>) => void 
)

export interface MainThreadEngine<T extends ModModules = []> extends MainThreadEngineCore {
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
        [Mod in T[number] as Mod["name"]]: ModAccessor<
            LocalModIndex<Mod>
        >
    }
}

export type ModLifeCycleEvents<T extends ModModules> = {
    onInit?: (metadata: ModMetadata, engineCore: MainThreadEngineCore) => Promise<void> | void
    onBeforeGameLoop?: (engine: MainThreadEngine<T>) => Promise<void> | void
    onExit?: (engine: MainThreadEngine<T>) => Promise<void> | void
}

export type LinkableMod<T extends ModData = ModData> = (
    { readonly data: T } 
    & ModLifeCycleEvents<[
        T, 
        ...NonNullable<T["dependencies"]>[typeof InnerMods]
    ]>
)