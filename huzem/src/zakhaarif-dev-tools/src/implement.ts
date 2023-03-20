import type {ShaheenEngine, Ecs, EcsSystem} from "./mods"

export interface ShaheenEngineImpl extends ShaheenEngine<[]> {}

export interface EcsImpl extends Ecs<[]> {}

export type EcsSystemImpl = EcsSystem<[]>
