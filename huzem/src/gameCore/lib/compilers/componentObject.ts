import type {
	ComponentDefinition,
	JsHeapRef,
	strict_u32, 
	strict_i32,
} from "zakhaarif-dev-tools"

export type ComponentRegisterMeta = Readonly<{
    name: string,
    definition: ComponentDefinition
}>

export type ComponentObjectConfig = {
    components: ComponentRegisterMeta[]
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
	maxComponentFields: number
	duplicateRef: number
}

export type ComponentObjectTokens = {
    allFields: string[]
    meta: ComponentObjectMeta[]
    componentCount: number
}

export function generateComponentObjectTokens(
	components: ComponentRegisterMeta[]
): ComponentObjectTokens {
	const fieldNameMap = new Map<string, number>()
	const meta: ComponentObjectMeta[] = []
	let componentCount = 0
	const duplicateMap = new Map<string, number>()
	let maxComponentFields = 0
	for (let i = 0; i < components.length; i++) {
		const component = components[i]
		const {name, definition} = component
		const defKeys = Object.keys(definition)
			.filter((key) => isAllowKey(key))
			.sort()
		const [type] = Object.values(definition)
		const layout: Record<string, number> = {}
		const fieldOffsetMap: Record<string, number> = {}
		maxComponentFields = Math.max(
			maxComponentFields, defKeys.length
		)
		fieldOffsetMap[layoutMapProperties[0]] = defKeys.length
		const componentKey = defKeys.reduce(
			(total, next) => `${total}_${next}`,
			`${type}_`
		)
		let classId = NO_DUPLICATE_REF
		let duplicateRef = NO_DUPLICATE_REF
		if (duplicateMap.has(componentKey)) {
			classId = duplicateMap.get(componentKey) || 0
			duplicateRef = classId
		} else {
			classId = STANDARD_CLASS_COUNT + componentCount++
			duplicateMap.set(componentKey, classId)
		}
		// a couple of class a reserved
		//const classId = STANDARD_CLASS_COUNT + componentCount++
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

export function isAllowKey(key: string): boolean {
	if (key.includes("$")) {
		return false
	}
	switch (key) {
	case pointerViewToObjectMethod:
	case pointerViewIndexMethod:
		return false
	default:
		return true
	}
}

export const layoutMapName = "LayoutMap"
export const layoutMapRegistryName = "layoutMapRegistryArray"
// by default the layout of pointer views are
// "Aos" array of struct views
export const pointerViewI32Name = "PointerViewI32"
export const pointerViewF32Name = "PointerViewF32"
// "Soa" stands for "struct of arrays"
export const pointerViewI32SoaName = "PointerViewSoaI32"
export const pointerViewF32SoaName = "PointerViewSoaF32"
export const componentObjectCodeExports = [
	layoutMapName, layoutMapRegistryName,
	pointerViewI32Name, pointerViewF32Name,
	pointerViewI32SoaName, pointerViewF32SoaName
] as const
const pointerViewPointerProp = "p$"
const pointerViewOffsetProp = "o$"
const pointerViewLayoutMapProp = "l$"
const pointerViewSizeofMethod = "sizeof$"
const pointerViewIndexMethod = "index"
const pointerViewToObjectMethod = "toObject"
const pointerViewPtrGetterSetterProp = "ptr$"
const pointerViewPtrComputedPtrProp = "computedPtr$"
const pointerViewlayoutIdMethod = "layoutId$"
export const pointerViewProperties = [
	pointerViewPointerProp, 
	pointerViewOffsetProp, 
	pointerViewLayoutMapProp,
	pointerViewSizeofMethod,
	pointerViewIndexMethod,
	pointerViewPtrGetterSetterProp,
	pointerViewPtrComputedPtrProp,
	pointerViewToObjectMethod,
	pointerViewlayoutIdMethod
] as const
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
	[pointerViewPtrComputedPtrProp]: strict_u32

	// methods
	[pointerViewIndexMethod]: (index: number) => PointerViewInstance
	[pointerViewSizeofMethod]: () => number
	[pointerViewToObjectMethod]: () => object
	[pointerViewlayoutIdMethod]: () => number
}
declare const layout: unique symbol
export type PointerViewSoaInstance = (
	PointerViewInstance & {
		[layout]: "soa"
	} 
)

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
            constructor({
				${standardPropDestructure}
				${fieldPropDestructure}
			}={}) {
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

		${createPointerViewClass(pointerViewI32Name, baseLayoutName, "i32", tokens, heapVarName, "aos", "u32")}
		${createPointerViewClass(pointerViewF32Name, baseLayoutName, "f32", tokens, heapVarName, "aos", "u32")}
		${createPointerViewClass(pointerViewI32SoaName, baseLayoutName, "i32", tokens, heapVarName, "soa", "u32")}
		${createPointerViewClass(pointerViewF32SoaName, baseLayoutName, "f32", tokens, heapVarName, "soa", "u32")}

        return {
			${layoutMapName},${layoutMapRegistryName},
			${pointerViewI32Name},${pointerViewF32Name},
			${pointerViewI32SoaName},${pointerViewF32SoaName}
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
	heapVarTokenName: string,
	// stands for struct of arrays (soa) or array of structs (aos)
	memoryLayout: "soa" | "aos",
	u32HeapView: keyof JsHeapRef & ("u32")
): string {
	const {meta, allFields} = tokens
	const [
		pointerProp, offsetProp, layoutProp
	] = pointerViewProperties
	const [sizeofProp, layoutMapIdProp] = layoutMapProperties
	const getSizeOf = `this.${layoutProp}.${sizeofProp}`
	const getLayoutMapId = `this.${layoutProp}.${layoutMapIdProp}`
	const castToI32 = "|0"
	const castToU32 = ">>>0"
	const bytesPer32Bits = 4
	const propertyGettersSetters = allFields.reduce((total, next, i) => {
		const accessorName = next
		const index = i
		const targetAddress = memoryLayout === "aos" 
			? `this.${pointerProp}+this.${offsetProp}+this.${layoutProp}.${fieldName(index)}`
			: `${heapVarTokenName}.${u32HeapView}[this.${pointerProp}+this.${layoutProp}.${fieldName(index)}]+this.${offsetProp}`
		const getter = `get "${accessorName}"() {return ${heapVarTokenName}.${targetHeapView}[${targetAddress}]}`
		const newValueToken = "val"
		const setter = `set "${accessorName}"(${newValueToken}) {${heapVarTokenName}.${targetHeapView}[${targetAddress}]=${newValueToken}}`
		return `${total}${getter}; ${setter};\n`
	}, "")
	const classSwitchMap = new Map<number, boolean>()
	const toObjectMethodSwitch = meta.reduce((switchToken, nextMeta) => {
		if (classSwitchMap.has(nextMeta.classId)) {
			return switchToken
		}
		classSwitchMap.set(nextMeta.classId, true)
		const objectKeys = Object.keys(nextMeta.layout)
		const objectReperesentation = objectKeys.reduce((object, nextKey) => {
			return `${object}"${nextKey}":this["${nextKey}"],`
		}, "")
		return `${switchToken}case ${nextMeta.classId}:{return {${objectReperesentation}}};`
	}, "")
	return `
	class ${className} {
		constructor() {this.${pointerProp}=0;this.${offsetProp}=0;this.${layoutProp}=${baseLayoutTokenName}}

		${propertyGettersSetters}
		
		${meta.reduce((total, {name, classId, duplicateRef}) => `${total}get "${name}"() {this.${layoutProp}=${layoutMapRefName(duplicateRef === NO_DUPLICATE_REF ? classId : duplicateRef)};return this}`, "")}

		${pointerViewlayoutIdMethod}() {return ${getLayoutMapId}}
		${pointerViewToObjectMethod}() {switch(${getLayoutMapId}){${toObjectMethodSwitch}default:{throw new Error("object layout doesn't exist")};}}
		${pointerViewSizeofMethod}() {return ${getSizeOf}*${bytesPer32Bits}}
		${pointerViewIndexMethod}(idx) {this.${offsetProp}=${memoryLayout === "aos" ? `(idx${castToI32})*${getSizeOf}` : `(idx${castToI32})`};return this}
		get ${pointerViewPtrGetterSetterProp}() {return this.${pointerProp}*${bytesPer32Bits}}
		set ${pointerViewPtrGetterSetterProp}(ptr){this.${pointerProp}=((ptr/${bytesPer32Bits})${castToU32})}

		get ${pointerViewPtrComputedPtrProp}() {return (this.${pointerProp}+this.${offsetProp})*${bytesPer32Bits}}
	}
	`.trim()
}
