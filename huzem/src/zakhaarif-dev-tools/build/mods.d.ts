import type { ExtendedEngineCore, InitializedEngineCore, PostInitializationCore } from "./engine";
export type ModDataResources<ImmutableResources extends object | undefined> = ImmutableResources extends undefined ? {} : {
    readonly resources: ImmutableResources;
};
export type ModMetadata = {
    canonicalUrl: string;
    resolvedUrl: string;
};
export type StateEvent<State extends object> = (metadata: ModMetadata, engineCore: InitializedEngineCore) => State;
export type ModData<Alias extends string, ImmutableResources extends object | undefined, State extends object> = {
    readonly alias: Alias;
    readonly resources?: ImmutableResources;
    state?: StateEvent<State>;
};
export type GenericModData = ModData<string, object | undefined, object>;
export type ModModules = ReadonlyArray<GenericModData>;
export type ModWrapper<Alias extends string, ImmutableResources extends object | undefined, State extends object> = (ModMetadata & {
    readonly alias: Alias;
    readonly resources: ImmutableResources extends undefined ? {} : ImmutableResources;
    state: State;
    dependencies: string[];
    originalModule: ModModule;
});
export type GenericModWrapper = ModWrapper<string, object | undefined, object>;
export interface ModView extends GenericModWrapper {
}
export type LinkedMods<EngineModules extends ModModules> = ({
    [mod in EngineModules[number] as mod["alias"]]: (ModWrapper<mod["alias"], mod["resources"] extends undefined ? {} : {
        readonly [key in keyof NonNullable<mod["resources"]>]: string;
    }, mod["state"] extends undefined ? {} : ReturnType<NonNullable<mod["state"]>>>);
});
export type EngineLinkedMods<EngineModules extends ModModules> = {
    mods: LinkedMods<EngineModules>;
};
export interface ModExtensions {
}
export type DependenciesDeclaration<Dependencies extends ModModules> = Dependencies extends [] ? {} : {
    readonly dependencies: {
        [index in keyof Dependencies]: Dependencies[index] extends {
            alias: string;
        } ? Dependencies[index]["alias"] : never;
    };
};
export type ModDeclaration<Dependencies extends ModModules, Alias extends string, ImmutableResources extends object | undefined, State extends object> = (DependenciesDeclaration<Dependencies> & ModData<Alias, ImmutableResources, State>);
export type ShaheenEngine<LinkedMods extends ModModules> = (EngineLinkedMods<LinkedMods> & InitializedEngineCore);
export type EnginePrimitives = Partial<PostInitializationCore>;
export type BeforeGameLoopEvent<LinkedMods extends ModModules> = (engine: ShaheenEngine<LinkedMods>) => Promise<void> | void;
export type InitEvent = (metadata: ModMetadata, engineCore: ExtendedEngineCore) => Promise<EnginePrimitives | void> | EnginePrimitives | void;
export type ExitEvent<LinkedMods extends ModModules> = BeforeGameLoopEvent<LinkedMods>;
export type ModLifeCycleEvents<Dependencies extends ModModules, Alias extends string, ImmutableResources extends object | undefined, State extends object> = {
    onInit?: InitEvent;
    onBeforeGameLoop?: BeforeGameLoopEvent<[
        ...Dependencies,
        ModData<Alias, ImmutableResources, State>
    ]>;
    onExit?: ExitEvent<[
        ...Dependencies,
        ModData<Alias, ImmutableResources, State>
    ]>;
};
export type Mod<Dependencies extends ModModules, Alias extends string, ImmutableResources extends object | undefined, State extends object> = (ModDeclaration<Dependencies, Alias, ImmutableResources, State> & ModLifeCycleEvents<Dependencies, Alias, ImmutableResources, State> & ModExtensions);
export declare const mod: <Dependencies extends ModModules = []>() => {
    create: <Alias extends string, ImmutableResources extends object | undefined, State extends object>(zMod: Mod<Dependencies, Alias, ImmutableResources, State>) => Mod<Dependencies, Alias, ImmutableResources, State>;
};
export type GenericMod = Mod<[
], string, object, object>;
export type ModModule<ExportedMod extends GenericMod = GenericMod> = {
    default: ExportedMod;
};
export type InferEngine<CurrentMod> = (CurrentMod extends Mod<infer Dep, infer Alias, infer ImmutableResources, infer State> ? ShaheenEngine<[
    ...Dep,
    ModData<Alias, ImmutableResources, State>
]> : never);
export type InferGameSystem<CurrentMod> = (CurrentMod extends Mod<infer Dep, infer Alias, infer ImmutableResources, infer State> ? (engine: ShaheenEngine<[
    ...Dep,
    ModData<Alias, ImmutableResources, State>
]>) => void : never);
export type InferBeforeGameLoopEvent<CurrentMod> = (CurrentMod extends Mod<infer Dep, infer Alias, infer ImmutableResources, infer State> ? BeforeGameLoopEvent<[
    ...Dep,
    ModData<Alias, ImmutableResources, State>
]> : never);
export type InferExitEvent<CurrentMod> = (InferBeforeGameLoopEvent<CurrentMod>);
