import type {
    f32, 
    i32, 
    u32
} from "./primitives"
import type {
    ModModules,
    ComponentDeclaration,
    QueryDeclaration,
    ArchetypeDeclaration,
    ExtractModComponentNames,
    ComponentDefWithName,
    LinkableMod,
    DependenciesList,
    ModData,
    DependentsWithBrand,
    ModLifeCycleEvents,
    MainThreadEngine,
    EcsSystem,
} from "./mods"
import {InnerMods} from "./symbols"

type TypeUtils<T extends ModModules> = (
    Required<ModLifeCycleEvents<T>>
    & {
        Engine: MainThreadEngine<T>,
        System: EcsSystem<T>
    }
)

export type Zutils<T extends ModData> = TypeUtils<[
    T, 
    ...NonNullable<T["dependencies"]>[typeof InnerMods]
]>

type DefineUtilities = Readonly<{
    data: <
        const TDeps extends DependentsWithBrand<ReadonlyArray<ModData>>,
        const TName extends string,
        const TState extends object,
        const TComponents extends ComponentDeclaration,
        const TQueries extends QueryDeclaration<ExtractModComponentNames<TComponents, TName>>,
        const TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponents, TName>>,
    >(data: ModData<TName, 
        TState,
        TComponents,
        TQueries,
        TArchetypes,
        TDeps
    >) => ModData<TName, 
        TState,
        TComponents,
        TQueries,
        TArchetypes,
        TDeps
    >
    
    mod: <
        const TDeps extends DependentsWithBrand<ReadonlyArray<ModData>>,
        const TName extends string,
        const TState extends object,
        const TComponents extends ComponentDeclaration,
        const TQueries extends QueryDeclaration<ExtractModComponentNames<TComponents, TName>>,
        const TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponents, TName>>,
    >(zmod: LinkableMod<ModData<TName, 
        TState,
        TComponents,
        TQueries,
        TArchetypes,
        TDeps
    >>) => LinkableMod<ModData<TName, 
        TState,
        TComponents,
        TQueries,
        TArchetypes,
        TDeps
    >>

    components: <
        const T extends ComponentDeclaration
    >(component: T) => T
    
    dependencies: <
        const T extends ReadonlyArray<LinkableMod> = []
    >(...h: DependenciesList<{
        [index in keyof T]: T[index]["data"]
    }>) => DependentsWithBrand<{
        [index in keyof T]: T[index]["data"]
    }>

    meta: <
        const TName extends string,
        const TDeps extends DependentsWithBrand<ReadonlyArray<ModData>>,
        const TComponents extends ComponentDeclaration,
        const TMeta extends Readonly<{ name: TName,  dependencies?: TDeps,  components?: TComponents }>
    >(meta: TMeta) => TMeta 
    
    f32: "f32",
    i32: "i32"
}>

const unitfn = <const T>(o: T) => o
const defutils: DefineUtilities = {
    data: unitfn,
    mod: unitfn,
    components: unitfn,
    dependencies: ((...a) => a) as DefineUtilities["dependencies"],
    meta: unitfn,

    f32: "f32",
    i32: "i32"
}
export const def = unitfn as typeof defutils.mod & typeof defutils
Object.assign(def, defutils)


const b = def({
    data: {
        name: "world1",
        components: {
            yey: {value: "i32"}
        }
    }
})

const a = def({
    data: {
        name: "world2",
        dependencies: def.dependencies<[typeof b]>(
            {name: "world1"}
        ),
        components: {
            yah: {value: "f32"}
        },
        archetypes: {
            p: {
                world2_yah: {value: 2.0}
            }
        }
    }
})

const libu32 = <T extends number>(value: T) => (value >>> 0) as u32<T>
const libf32 = <T extends number>(value: T) => Math.fround(value) as f32<T>
const libi32 = <T extends number>(value: T) => (value | 0) as i32<T>

export const std = {
    u32: libu32,
    f32: libf32,
    i32: libi32,
} as const
