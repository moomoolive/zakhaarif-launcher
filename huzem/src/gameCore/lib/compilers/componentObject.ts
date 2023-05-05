import type {
	ComponentDefinition,
	JsHeapRef
} from "zakhaarif-dev-tools"

export type ComponentToken = Readonly<{
    name: string,
    definition: ComponentDefinition
}>

export type ComponentObjectConfig = {
    components: ComponentToken[]
} 

export const layoutMapProperties = ["size$", "layoutId$"] as const
type LayoutMapProps = {
	size$: number
	classId$: number
}
export type LayoutFieldName<T extends number> = `f${T}`
const fieldName = <T extends number>(index: T): LayoutFieldName<T> => `f${index}`
const NO_DUPLICATE_REF = -1
export const STANDARD_CLASS_COUNT = 1

export type ComponentObjectMeta = {
    name: string, 
    type: string, 
    layout: Record<string, number>,
    fieldOffsetMap: Record<string, number>
    classId: number
    duplicateRef: number
}

export type ComponentObjectTokens = {
    allFields: string[]
    meta: ComponentObjectMeta[]
    componentCount: number
}

export function generateComponentObjectTokens(
	components: ComponentToken[]
): ComponentObjectTokens {
	const fieldNameMap = new Map<string, number>()
	const meta: ComponentObjectMeta[] = []
	let componentCount = 0
	const duplicateMap = new Map<string, number>()
	for (let i = 0; i < components.length; i++) {
		const component = components[i]
		const {name, definition} = component
		const defKeys = Object.keys(definition).sort()
		const [type] = Object.values(definition)
		const layout: Record<string, number> = {}
		const fieldOffsetMap: Record<string, number> = {}
		const bytesPer32bits = 4
		layout[layoutMapProperties[0]] = defKeys.length * bytesPer32bits
		// a couple of class a reserved
		const classId = STANDARD_CLASS_COUNT + componentCount++
		fieldOffsetMap[layoutMapProperties[1]] = classId
		for (let f = 0; f < defKeys.length; f++) {
			const key = defKeys[f]
			const byteOffset = f * bytesPer32bits
			layout[key] = f * bytesPer32bits
			if (fieldNameMap.has(key)) {
				const keyIndex = fieldNameMap.get(key) || 0
				fieldOffsetMap[fieldName(keyIndex)] = byteOffset
				continue
			}
			const fieldMapIndex = fieldNameMap.size
			fieldNameMap.set(key, fieldMapIndex)
			fieldOffsetMap[fieldName(fieldMapIndex)] = byteOffset
		}
		const componentKey = defKeys.reduce(
			(total, next) => `${total}_${next}`,
			`${type}_`
		)
		let duplicateRef = NO_DUPLICATE_REF
		if (duplicateMap.has(componentKey)) {
			duplicateRef = duplicateMap.get(componentKey) || 0
		} else {
			duplicateMap.set(componentKey, classId)
		}
		meta.push({
			name, 
			type, 
			layout, 
			classId,
			duplicateRef,
			fieldOffsetMap
		})
	}
	return {
		allFields: [...fieldNameMap.keys()],
		meta,
		componentCount
	}
}


export const layoutMapName = "LayoutMap"
export const layoutMapRegistryName = "layoutMapRegistry"
export const pointerViewI32Name = "PointerViewI32"
export const pointerViewF32Name = "PointerViewF32"
export const pointerViewProperties = ["p$", "o$", "l$"] as const
type _PointerViewProps = {
	/** stands for pointer (a u32) */
	p$: number,
	/** stands for offset (an i32) from pointer */
	o$: number,
	/**
	 * stands for layout map. This is essential a large
	 * object that maps getter and setter fields to certain
	 * offsets from pointer.
	 */
	l$: LayoutMapProps
}
const heapVarName = "h"
type LayoutMapRefName<T extends number> = `layoutMapRef${T}`
const layoutMapRefName = <T extends number>(classId: T): LayoutMapRefName<T> => `layoutMapRef${classId}`
const baseLayoutName =  layoutMapRefName(0)

export function generateComponentObjectCode$(
	tokens: ComponentObjectTokens
) {
	const {allFields, meta} = tokens
	const fieldNameMap = new Map<string, string>()
	for (let i = 0; i < allFields.length; i++) {
		const field = allFields[i]
		fieldNameMap.set(field, fieldName(i))
	}
	const uniqueLayouts = meta.filter(
		(comp) => comp.duplicateRef === NO_DUPLICATE_REF
	)
	const standardPropDestructure = layoutMapProperties.reduce(
		(total, next) => `${total}${next}=0,`,
		""
	)
	const fieldPropDestructure = allFields.reduce(
		(total, _, index) => `${total}${fieldName(index)}=0,`,
		""
	)
	const baseLayoutProps = JSON.stringify({
		[layoutMapProperties[0]]: 0,
		[layoutMapProperties[1]]: 0
	})
	const componentObjectContext = `(${heapVarName}) => {
        class ${layoutMapName} {
            constructor({${standardPropDestructure}${fieldPropDestructure}}={}) {
                ${layoutMapProperties.reduce((total, next) => `${total}this.${next}=${next};`, "")}
				${allFields.reduce((total, _, index) => `${total}this.${fieldName(index)}=${fieldName(index)};`, "")}
            }
        }

        const ${baseLayoutName} = new ${layoutMapName}(${baseLayoutProps});
		${uniqueLayouts.reduce((total, next) => {
		const {fieldOffsetMap, classId} = next
		const name = layoutMapRefName(classId)
		return `${total}const ${name} = new ${layoutMapName}(${JSON.stringify(fieldOffsetMap)});`
	}, "")}
        
        const ${layoutMapRegistryName} = [
			${baseLayoutName},
			${uniqueLayouts.reduce((total, {classId}) => `${total}${layoutMapRefName(classId)},`, "")}
		]

        class ${pointerViewI32Name} {
			${createPointerViewConstructor(baseLayoutName)}

			${createPropertyAccessors(allFields, heapVarName, "v", "getInt32", "setInt32")}
			
			${createLayoutModifiers(meta)}

			${pointerViewStandardMethods()}
        }

        return {
			${layoutMapName},${layoutMapRegistryName},
			${pointerViewI32Name},${""}
		}
    }`
	return {
		componentObjectContext
	} as const
}

type DataViewAccessor = `get${string}`
type DataViewMutator = `set${string}`

function createPropertyAccessors<T extends keyof JsHeapRef>(
	properties: string[],
	heapTokenName: string,
	targetHeapView: T,
	accessorMethod: T extends "v" 
		? keyof DataView & DataViewAccessor 
		: "must-pick-dataview",
	mutatorMethod: T extends "v" 
		? keyof DataView & DataViewMutator 
		: "must-pick-dataview",
): string {
	let accessors = ""
	const [
		pointerProp, offsetProp, layoutProp
	] = pointerViewProperties
	for (let i = 0; i < properties.length; i++) {
		const accessorName = properties[i]
		const index = i
		const targetAddress = `this.${pointerProp}+this.${offsetProp}+this.${layoutProp}.${fieldName(index)}`
		const useLittleEndian = "true"
		const getter = `get"${accessorName}"(){return ${heapTokenName}.${targetHeapView}.${accessorMethod}(${targetAddress},${useLittleEndian})};`
		const newValueToken = "val"
		const setter = `set"${accessorName}"(${newValueToken}){${heapTokenName}.${targetHeapView}.${mutatorMethod}(${targetAddress},${newValueToken},${useLittleEndian})};`
		accessors += `${getter}${setter}`
	}
	return accessors
}

function createPointerViewConstructor(
	defaultLayoutName: string
): string {
	const [pointerProp, offsetProp, layoutProp] = pointerViewProperties
	const construct = `constructor(){this.$${pointerProp}=0;this.${offsetProp}=0;this.${layoutProp}=${defaultLayoutName}}`
	return construct
}

function pointerViewStandardMethods(): string {
	let methods = ""
	const [pointerProp, offsetProp, layoutPointerProp] = pointerViewProperties
	const [sizeofProp] = layoutMapProperties
	const getSizeOf = `this.${layoutPointerProp}.${sizeofProp}`
	methods += `sizeof$(){return ${getSizeOf}};`
	const indexToken = "i"
	methods += `index(${indexToken}){this.${offsetProp}=${indexToken}*${getSizeOf};return this};`
	methods += `get ptr$(){return this.${pointerProp}};`
	const newPtrToken = "ptr"
	const castToU32 = ">>>0"
	methods += `set ptr$(${newPtrToken}){this.${pointerProp}=(${newPtrToken}${castToU32})};`
	return methods
}

function createLayoutModifiers(metas: ComponentObjectMeta[]): string {
	return metas.reduce((total, next) => {
		const [_p, _o, layoutMapProp] = pointerViewProperties
		const {name, classId} = next
		return `${total}get"${name}"(){this.${layoutMapProp}=${layoutMapRefName(classId)};return this};`
	}, "")
}
3>>>0