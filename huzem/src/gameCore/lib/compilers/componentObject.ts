import type {
	ComponentDefinition,
	JsHeapRef,
	strict_u32, 
	strict_i32,
} from "zakhaarif-dev-tools"

export type ComponentToken = Readonly<{
    name: string,
    definition: ComponentDefinition
}>

export type ComponentObjectConfig = {
    components: ComponentToken[]
} 

const layoutMapSizeProp = "size$"
const layoutMapLayoutIdProp = "layoutId$"
export const layoutMapProperties = [
	layoutMapSizeProp, layoutMapLayoutIdProp
] as const
export type LayoutFieldName<T extends number> = `f${T}`
export type LayoutMap = {
	[layoutMapSizeProp]: number
	[layoutMapLayoutIdProp]: number
	[key: LayoutFieldName<number>]: number
}
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
	maxComponentFields: number
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
	let maxComponentFields = 0
	for (let i = 0; i < components.length; i++) {
		const component = components[i]
		const {name, definition} = component
		const defKeys = Object.keys(definition).sort()
		const [type] = Object.values(definition)
		const layout: Record<string, number> = {}
		const fieldOffsetMap: Record<string, number> = {}
		maxComponentFields = Math.max(
			maxComponentFields, defKeys.length
		)
		fieldOffsetMap[layoutMapProperties[0]] = defKeys.length
		// a couple of class a reserved
		const classId = STANDARD_CLASS_COUNT + componentCount++
		fieldOffsetMap[layoutMapProperties[1]] = classId
		for (let f = 0; f < defKeys.length; f++) {
			const key = defKeys[f]
			const byteOffset = f
			layout[key] = byteOffset
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
			fieldOffsetMap,
			maxComponentFields
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
const pointerViewPointerProp = "p$"
const pointerViewOffsetProp = "o$"
const pointerViewLayoutMapProp = "l$"
const pointerViewSizeofMethod = "sizeof$"
const pointerViewIndexMethod = "index"
export const pointerViewProperties = [
	pointerViewPointerProp, 
	pointerViewOffsetProp, 
	pointerViewLayoutMapProp
] as const
const pointerViewPtrGetterSetterProp = "ptr$"
export type PointerViewInstance = {
	/** stands for pointer (a u32) */
	[pointerViewPointerProp]: strict_u32
	/** stands for offset (an i32) from pointer */
	[pointerViewOffsetProp]: strict_i32
	/**
	 * stands for layout map. This is essential a large
	 * object that maps getter and setter fields to certain
	 * offsets from pointer.
	 */
	[pointerViewLayoutMapProp]: LayoutMap
	[pointerViewPtrGetterSetterProp]: strict_u32

	[pointerViewIndexMethod](index: number): PointerViewInstance
	readonly [pointerViewSizeofMethod]: number
}

type LayoutMapRefName<T extends number> = `layoutMapRef${T}`
const layoutMapRefName = <T extends number>(classId: T): LayoutMapRefName<T> => `layoutMapRef${classId}`

declare const componentCtx: unique symbol

type ContextString<T extends string> = string & {
	[componentCtx]: T
}

export type ComponentContextString = ContextString<"co_ctx">

export type ComponentContext = {
    readonly componentObjectContext: ComponentContextString
}

export function generateComponentObjectCode$(
	tokens: ComponentObjectTokens
): ComponentContext {
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
	const heapVarName = "h"
	const baseLayoutName =  layoutMapRefName(0)
	const componentObjectContext = `(${heapVarName}) => {
        class ${layoutMapName} {
            constructor({${standardPropDestructure}${fieldPropDestructure}}={}) {
                ${layoutMapProperties.reduce((total, next) => `${total}this.${next}=${next};`, "")}
				${allFields.reduce((total, _, index) => `${total}this.${fieldName(index)}=${fieldName(index)};`, "")}
            }
        }

        const ${baseLayoutName} = new ${layoutMapName}(${baseLayoutProps});
		${createUniqueLayoutMaps(uniqueLayouts)}
        
        const ${layoutMapRegistryName} = [
			${baseLayoutName},
			${uniqueLayouts.reduce((total, {classId}) => `${total}${layoutMapRefName(classId)},`, "")}
		]

		${createPointerViewClass(pointerViewI32Name, baseLayoutName, "i32", tokens, heapVarName)}

        return {
			${layoutMapName},${layoutMapRegistryName},
			${pointerViewI32Name},
		}
    }` as ContextString<"co_ctx">
	return {
		componentObjectContext
	} as const
}

function createUniqueLayoutMaps(
	uniqueLayouts: ComponentObjectMeta[]
): string {
	let layouts = ""
	for (let i = 0; i < uniqueLayouts.length; i++) {
		const next = uniqueLayouts[i]
		const {fieldOffsetMap, classId} = next
		const name = layoutMapRefName(classId)
		layouts += `const ${name} = new ${layoutMapName}(${JSON.stringify(fieldOffsetMap)});`
	}
	return layouts
}

function createPointerViewClass(
	className: string,
	baseLayoutTokenName: string,
	targetHeapView: keyof JsHeapRef & ("i32" | "f32"),
	tokens: ComponentObjectTokens,
	heapVarTokenName: string
): string {
	const {meta, allFields} = tokens
	const [
		pointerProp, offsetProp, layoutProp
	] = pointerViewProperties
	const [sizeofProp] = layoutMapProperties
	const getSizeOf = `this.${layoutProp}.${sizeofProp}`
	const castToI32 = "|0"
	const castToU32 = ">>>0"
	const bytesPer32Bits = 4
	const propertyGettersSetters = allFields.reduce((total, next, i) => {
		const accessorName = next
		const index = i
		const targetAddress = `this.${pointerProp}+this.${offsetProp}+this.${layoutProp}.${fieldName(index)}`
		const getter = `get "${accessorName}"() {return ${heapVarTokenName}.${targetHeapView}[${targetAddress}]}`
		const newValueToken = "val"
		const setter = `set "${accessorName}"(${newValueToken}) {${heapVarTokenName}.${targetHeapView}[${targetAddress}]=${newValueToken}}`
		return `${total}${getter}; ${setter};\n`
	}, "")
	return `
	class ${className} {
		constructor() {this.${pointerProp}=0;this.${offsetProp}=0;this.${layoutProp}=${baseLayoutTokenName}}

		${propertyGettersSetters}
		
		${meta.reduce((total, {name, classId}) => `${total}get "${name}"() {this.${layoutProp}=${layoutMapRefName(classId)};return this}`, "")}

		${pointerViewSizeofMethod}() {return ${getSizeOf}}
		${pointerViewIndexMethod}(ptr) {this.${offsetProp}=(ptr${castToI32})*${getSizeOf};return this}
		get ${pointerViewPtrGetterSetterProp}() {return this.${pointerProp}*${bytesPer32Bits}}
		set ${pointerViewPtrGetterSetterProp}(ptr){this.${pointerProp}=((ptr/${bytesPer32Bits})${castToU32})}
	}
	`.trim()
}