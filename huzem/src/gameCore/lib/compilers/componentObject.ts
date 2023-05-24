import type {
	ComponentDefinition,
	JsHeapRef,
	strict_u32, 
	strict_i32,
} from "zakhaarif-dev-tools"

export type ComponentRegisterMeta = Readonly<{
	classId: number
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
    layoutId: number
	maxComponentFields: number
	duplicateRef: number
	classId: number
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
		const {name, definition, classId} = component
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
		let layoutId = 0
		let duplicateRef = NO_DUPLICATE_REF
		if (duplicateMap.has(componentKey)) {
			layoutId = duplicateMap.get(componentKey) || 0
			duplicateRef = layoutId
		} else {
			layoutId = STANDARD_CLASS_COUNT + componentCount++
			duplicateMap.set(componentKey, layoutId)
		}
		// a couple of class a reserved
		//const classId = STANDARD_CLASS_COUNT + componentCount++
		fieldOffsetMap[layoutMapProperties[1]] = layoutId
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
			layoutId,
			duplicateRef,
			fieldOffsetMap,
			maxComponentFields,
			classId
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
	case pointerViewCloneRefMethod:
	case pointerViewConstRefMethod:
	case pointerViewMutRefMethod:
	case pointerViewMoveRefMethod:
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
const pointerViewConstRefMethod = "ref"
const pointerViewMutRefMethod = "mut"
const pointerViewMoveRefMethod = "move"
const pointerViewCloneRefMethod = "cloneRef"
const pointerViewPtrGetterSetterProp = "ptr$"
const pointerViewPtrComputedPtrProp = "computedPtr$"
const pointerViewlayoutIdMethod = "layoutId$"
const pointerViewToLayoutMethod = "toLayout$"
export const pointerViewProperties = [
	pointerViewPointerProp, 
	pointerViewOffsetProp, 
	pointerViewLayoutMapProp,
	pointerViewSizeofMethod,
	pointerViewIndexMethod,
	pointerViewPtrGetterSetterProp,
	pointerViewPtrComputedPtrProp,
	pointerViewToObjectMethod,
	pointerViewlayoutIdMethod,
	pointerViewToLayoutMethod,
	pointerViewCloneRefMethod,
	pointerViewConstRefMethod,
	pointerViewMutRefMethod,
	pointerViewMoveRefMethod,
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
	[pointerViewToLayoutMethod]: (layoutId: number) => PointerViewInstance
	[pointerViewCloneRefMethod]: () => PointerViewInstance
	[pointerViewConstRefMethod]: () => PointerViewInstance
	[pointerViewMutRefMethod]: () => PointerViewInstance
	[pointerViewMoveRefMethod]: () => PointerViewInstance
}
declare const layout: unique symbol
export type PointerViewSoaInstance = (
	PointerViewInstance & { [layout]: "soa" } 
)

type LayoutMapRefName<T extends number> = `layoutMapRef${T}`
const layoutMapRefName = <T extends number>(classId: T): LayoutMapRefName<T> => `layoutMapRef${classId}`

declare const componentCtx: unique symbol

type ContextString<T extends string> = string & {
	[componentCtx]: T
}

const BASE_LAYOUT_NAME = layoutMapRefName(0)

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
	const classSwitchMap = new Map<number, boolean>()
	const toObjectMethodSwitch = meta.reduce((switchToken, nextMeta) => {
		if (classSwitchMap.has(nextMeta.layoutId)) {
			return switchToken
		}
		classSwitchMap.set(nextMeta.layoutId, true)
		const objectKeys = Object.keys(nextMeta.layout)
		const objectReperesentation = objectKeys.reduce((object, nextKey) => {
			return `${object}"${nextKey}":this["${nextKey}"],`
		}, "")
		return `${switchToken}case ${nextMeta.layoutId}:{return {${objectReperesentation}}};`
	}, "")
	const pointerViewToObjectToken = `${pointerViewToObjectMethod}() {switch(${POINTER_VIEW_GET_LAYOUT_ID}){${toObjectMethodSwitch}default:{throw new Error("object layout doesn't exist")};}}`
	type LayoutRef = number
	type ClassList = { classes: number[], key: string, layout: number }
	const layoutMapper = new Map<LayoutRef, ClassList>()
	for (let i = 0; i < meta.length; i++) {
		const nextMeta = meta[i]
		const {layoutId, classId, name} = nextMeta
		const entry = layoutMapper.get(layoutId)
		if (entry) {
			entry.classes.push(classId)
			continue
		}
		layoutMapper.set(layoutId, {
			classes: [classId],
			key: name,
			layout: layoutId
		})
	}
	let toLayoutMethodSwitch = ""
	for (const list of layoutMapper.values()) {
		let cases = ""
		for (let i = 0; i < list.classes.length; i++) {
			cases += `case ${list.classes[i]}:`
		}
		cases += `{this.${pointerViewLayoutMapProp}=${layoutMapRefName(list.layout)};return this}`
		toLayoutMethodSwitch += cases
	}
	const pointerViewToLayoutToken = `${pointerViewToLayoutMethod}(id) {switch(id){${toLayoutMethodSwitch}default:{throw new Error(\`class id \${id} doesn't exist. Is inputted class id valid?\`)};}}`
	const changeClassLayoutMethods = meta.reduce((total, {name, layoutId, duplicateRef}) => `${total}get "${name}"() {this.${pointerViewLayoutMapProp}=${layoutMapRefName(duplicateRef === NO_DUPLICATE_REF ? layoutId : duplicateRef)};return this}`, "")
	const pointerViewJITMethods = `
	${changeClassLayoutMethods}

	${pointerViewToLayoutToken}
	${pointerViewToObjectToken}
	`
	const baseLayoutProps = JSON.stringify({
		[layoutMapProperties[0]]: 0,
		[layoutMapProperties[1]]: 0
	})
	const heapVarName = "h"
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

        const ${BASE_LAYOUT_NAME} = new ${layoutMapName}(${baseLayoutProps});
		${createUniqueLayoutMaps(uniqueLayouts)}
        
        const ${layoutMapRegistryName} = [
			${BASE_LAYOUT_NAME},
			${uniqueLayouts.reduce((total, {layoutId}) => `${total}${layoutMapRefName(layoutId)},`, "")}
		]

		${createPointerViewClass(pointerViewI32Name, pointerViewJITMethods, "i32", tokens, heapVarName, "aos", "u32")}
		${createPointerViewClass(pointerViewF32Name, pointerViewJITMethods, "f32", tokens, heapVarName, "aos", "u32")}
		${createPointerViewClass(pointerViewI32SoaName, pointerViewJITMethods, "i32", tokens, heapVarName, "soa", "u32")}
		${createPointerViewClass(pointerViewF32SoaName, pointerViewJITMethods, "f32", tokens, heapVarName, "soa", "u32")}

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
		const {fieldOffsetMap, layoutId} = next
		const name = layoutMapRefName(layoutId)
		layouts += `const ${name} = new ${layoutMapName}(${JSON.stringify(fieldOffsetMap)});`
	}
	return layouts
}

const POINTER_VIEW_GET_SIZEOF = `this.${pointerViewLayoutMapProp}.${layoutMapSizeProp}` as const
const BYTES_PER_32BITS = 4
const CAST_TO_U32 = ">>>0"
const CAST_TO_I32 = "|0"
const POINTER_VIEW_GET_LAYOUT_ID = `this.${pointerViewLayoutMapProp}.${layoutMapLayoutIdProp}` as const
const STANDARD_POINTER_VIEW_METHODS = `
constructor(ptr=0, offset=0, layout=${BASE_LAYOUT_NAME}) {this.${pointerViewPointerProp}=ptr;this.${pointerViewOffsetProp}=offset;this.${pointerViewLayoutMapProp}=layout}

${pointerViewSizeofMethod}() {return ${POINTER_VIEW_GET_SIZEOF}*${BYTES_PER_32BITS}}
${pointerViewlayoutIdMethod}() {return ${POINTER_VIEW_GET_LAYOUT_ID}}
get ${pointerViewPtrGetterSetterProp}() {return this.${pointerViewPointerProp}*${BYTES_PER_32BITS}}
set ${pointerViewPtrGetterSetterProp}(ptr){this.${pointerViewPointerProp}=((ptr/${BYTES_PER_32BITS})${CAST_TO_U32})}
get ${pointerViewPtrComputedPtrProp}() {return (this.${pointerViewPointerProp}+this.${pointerViewOffsetProp})*${BYTES_PER_32BITS}}
${pointerViewCloneRefMethod}() {return new this.constructor(this.${pointerViewPointerProp},this.${pointerViewOffsetProp},this.${pointerViewLayoutMapProp})}
` as const

function createPointerViewClass(
	className: string,
	pointerViewJITMethods: string,
	targetHeapView: keyof JsHeapRef & ("i32" | "f32"),
	tokens: ComponentObjectTokens,
	heapVarTokenName: string,
	// stands for struct of arrays (soa) or array of structs (aos)
	memoryLayout: "soa" | "aos",
	u32HeapView: keyof JsHeapRef & ("u32"),
): string {
	const {allFields} = tokens
	const [
		pointerProp, offsetProp, layoutProp
	] = pointerViewProperties

	let propertyGetSet = ""
	for (let i = 0; i < allFields.length; i++) {
		const next = allFields[i]
		const accessorName = next
		const index = i
		const targetAddress = memoryLayout === "aos" 
			? `this.${pointerProp}+this.${offsetProp}+this.${layoutProp}.${fieldName(index)}`
			: `${heapVarTokenName}.${u32HeapView}[this.${pointerProp}+this.${layoutProp}.${fieldName(index)}]+this.${offsetProp}`
		const getter = `get "${accessorName}"() {return ${heapVarTokenName}.${targetHeapView}[${targetAddress}]}`
		const newValueToken = "val"
		const setter = `set "${accessorName}"(${newValueToken}) {${heapVarTokenName}.${targetHeapView}[${targetAddress}]=${newValueToken}}`
		propertyGetSet += `${getter}; ${setter};\n`
	}
	const returnThisMethod = `${className}ReturnThis`
	return `class ${className} {
		${STANDARD_POINTER_VIEW_METHODS}
		${pointerViewJITMethods}

		${propertyGetSet}
		${pointerViewIndexMethod}(idx) {this.${offsetProp}=${memoryLayout === "aos" ? `(idx${CAST_TO_I32})*${POINTER_VIEW_GET_SIZEOF}` : `(idx${CAST_TO_I32})`};return this}
	}
	function ${returnThisMethod}() {
		return this
	}
	Object.defineProperty(${className}.prototype, "${pointerViewConstRefMethod}", {
		value: ${returnThisMethod}
	})
	Object.defineProperty(${className}.prototype, "${pointerViewMutRefMethod}", {
		value: ${returnThisMethod}
	})
	Object.defineProperty(${className}.prototype, "${pointerViewMoveRefMethod}", {
		value: ${returnThisMethod}
	})`
	
}
