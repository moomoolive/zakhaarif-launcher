import type {
	ComponentDefinition
} from "zakhaarif-dev-tools"

export type ComponentToken = Readonly<{
    name: string,
    definition: ComponentDefinition
}>

export type ComponentObjectConfig = {
    components: ComponentToken[]
} 

export const layoutMapProperties = ["size$", "id$"] as const
export type LayoutFieldName<T extends number> = `f${T}`
const fieldName = <T extends number>(index: T): LayoutFieldName<T> => `f${index}`
const NO_DUPLICATE_REF = -1

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
		// class id 0 is reserved, so class ids start from 1
		const classId = 1 + componentCount++
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
/** 
 * p$ stands for pointer (an u32), 
 * o$ stands for offset (an i32)
 * l$ stands for layout pointer (a js object)
 * */
export const pointerViewProperties = ["p$", "o$", "l$"] as const
const heapVarName = "h"
/** 
 * "v" property corresponds to dataview on the JsHeapRef
 * interface in "zakhaarif-dev-tools"
 */
const heapDataview: "h.v" = `${heapVarName}.v`
export const STANDARD_CLASS_COUNT = 1
const useLittleEndian = "true"

const dv = new DataView(new ArrayBuffer(1))
dv.getFloat32

export type ClassLayoutName<T extends number> = `classLayout${T}`
const classLayoutName = <T extends number>(classId: T): ClassLayoutName<T> => `classLayout${classId}`
const baseLayoutName =  classLayoutName(0)

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
	const componentObjectContext = `(${heapVarName}) => {
        class ${layoutMapName} {
            constructor({${layoutMapProperties.reduce(
		(total, next) => `${total}${next}=0,`,
		""
	)}${allFields.reduce(
	(total, _, index) => `${total}${fieldName(index)}=0,`,
	""
)}}={}) {
                ${layoutMapProperties.reduce(
		(total, next) => `${total}this.${next}=${next};`,
		""
	)}${allFields.reduce(
	(total, _, index) => `${total}this.${fieldName(index)}=${fieldName(index)};`,
	""
)}
            }
        }

        const ${baseLayoutName} = new ${layoutMapName}(${JSON.stringify({
	[layoutMapProperties[0]]: 0,
	[layoutMapProperties[1]]: 0
})});${uniqueLayouts.reduce(
	(total, next) => {
		const {fieldOffsetMap, classId} = next
		const name = classLayoutName(classId)
		return `${total}const ${name} = new ${layoutMapName}(${JSON.stringify(fieldOffsetMap)});`
	}, 
	""
)}
        
        const ${layoutMapRegistryName} = [${baseLayoutName},${uniqueLayouts.reduce(
	(total, {classId}) => `${total}${classLayoutName(classId)},`,
	""
)}]

        class ${pointerViewI32Name} {
            constructor() {
                ${pointerViewProperties.reduce(
		(total, next) => next === "l$" 
			? `${total}this.${next}=${baseLayoutName}` 
			: `${total}this.${next}=0;`,
		""
	)}
            }

            ${allFields.reduce(
		(total, next, index) => {
			const getter = `get"${next}"(){return ${heapDataview}.getInt32(this.${pointerViewProperties[0]}+this.${pointerViewProperties[1]}+this.${pointerViewProperties[2]}.${fieldName(index)},${useLittleEndian})}`
			const input = "val"
			const setter = `set"${next}"(${input}){${heapDataview}.getInt32(this.${pointerViewProperties[0]}+this.${pointerViewProperties[1]}+this.${pointerViewProperties[2]}.${fieldName(index)},${input},${useLittleEndian})}`
			return `${total}${getter};${setter};`
		},
		""
	)}
        }

        class ${pointerViewF32Name} {
            constructor() {
                ${pointerViewProperties.reduce(
		(total, next) => next === "l$" 
			? `${total}this.${next}=${baseLayoutName}` 
			: `${total}this.${next}=0;`,
		""
	)}
            }

            ${allFields.reduce(
		(total, next, index) => {
			const getter = `get"${next}"(){return ${heapDataview}.getFloat32(this.${pointerViewProperties[0]}+this.${pointerViewProperties[1]}+this.${pointerViewProperties[2]}.${fieldName(index)},${useLittleEndian})}`
			const input = "val"
			const setter = `set"${next}"(${input}){${heapDataview}.setFloat32(this.${pointerViewProperties[0]}+this.${pointerViewProperties[1]}+this.${pointerViewProperties[2]}.${fieldName(index)},${input},${useLittleEndian})}`
			return `${total}${getter};${setter};`
		},
		""
	)}
        }

        return {${layoutMapName},${layoutMapRegistryName},${pointerViewI32Name},${pointerViewF32Name}}
    }`
	return {
		componentObjectContext
	} as const
}