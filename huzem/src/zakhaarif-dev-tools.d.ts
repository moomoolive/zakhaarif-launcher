import * as Types from "zakhaarif-dev-tools"

declare module "zakhaarif-dev-tools" {
    type EcsSystem = (engine: Types.ShaheenEngine) => void

    interface Ecs {
        addSystem: (system: EcsSystem) => number
    }

    export interface ShaheenEngineExtensions {
        getDeltaTime: () => number
        ecs: Ecs
    }

    type Vec3 = {
        x: number
        y: number
        z: number
    }

    export interface ZakhaarifModExtensions {}

    export * from "zakhaarif-dev-tools"
}