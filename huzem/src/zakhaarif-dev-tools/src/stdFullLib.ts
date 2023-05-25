import type {
    ConstReference,
    MutReference,
    OwnedReference,
    f32, 
    i32, 
    u32
} from "./primitives"
import type {
    ModModules,
    ImmutableResourceMap,
    ComponentDeclaration,
    QueryDeclaration,
    ArchetypeDeclaration,
    ModDataWithDependents,
    ExtractModComponentNames,
    ComponentDefWithName,
    LinkableMod,
} from "./mods"

export const ALLOW_ALL_PERMISSIONS = "allowAll"

export const type = {
    u32: <T extends number>(value: T) => (value >>> 0) as u32<T>,
    f32: <T extends number>(value: T) => Math.fround(value) as f32<T>,
    i32: <T extends number>(value: T) => (value | 0) as i32<T>
} as const

export const cast = {
    toConstRef: <T>(ref: OwnedReference<T> | MutReference<T>) => ref as unknown as ConstReference<T>,
    u32: <T extends number>(value: T) => (value >>> 0) as u32<T>,
    f32: <T extends number>(value: T) => Math.fround(value) as f32<T>,
    i32: <T extends number>(value: T) => (value | 0) as i32<T>
} as const

type DefineUtilities<TLinkedMods extends ModModules> = {
    data<
        TName extends string,
        TImmutableResources extends ImmutableResourceMap,
        TState extends object,
        TComponentDefs extends ComponentDeclaration,
        TQueries extends QueryDeclaration<ExtractModComponentNames<TComponentDefs, TName>>,
        TArchetypes extends ArchetypeDeclaration<ComponentDefWithName<TComponentDefs, TName>>
    >(zMod: ModDataWithDependents<
        TLinkedMods, 
        TName, 
        TImmutableResources,
        TState,
        TComponentDefs,
        TQueries,
        TArchetypes
    >): ModDataWithDependents<
        TLinkedMods, 
        TName, 
        TImmutableResources,
        TState,
        TComponentDefs,
        TQueries,
        TArchetypes
    >
    mod<T extends ModDataWithDependents>(zmod: LinkableMod<T>): LinkableMod<T>
    components<T extends ComponentDeclaration>(c: T): T
}

const unitfn = <T>(o: T) => o
const def: DefineUtilities<[]> = {
    data: unitfn,
    mod: unitfn,
    components: unitfn
}
export const define = (() => def) as (typeof def & (<T extends ModModules = []>() => DefineUtilities<T>))
Object.assign(define, def)