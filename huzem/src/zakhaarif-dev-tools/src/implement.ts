import type {
    ShaheenEngine, 
    Ecs, 
    EcsSystem,
    ModDataWithDependents,
    ImmutableResourceMap,
    LinkableMod,
    ComponentDeclaration
} from "./mods"

export interface ShaheenEngineImpl extends ShaheenEngine<[]> {}

export interface EcsImpl extends Ecs<[]> {}

export type EcsSystemImpl = EcsSystem<[]>

type GenericMod = LinkableMod<
    ModDataWithDependents<
        [], 
        string, 
        ImmutableResourceMap,
        object,
        ComponentDeclaration,
        {},
        {}
    >
>
export type ModModule<ExportedMod extends GenericMod = GenericMod> = {
    mod: ExportedMod
}
