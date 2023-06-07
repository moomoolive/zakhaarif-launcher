import type {
	ComponentDefinition,
	JsHeapRef,
} from "zakhaarif-dev-tools"
import {defineProp} from "../utils"

const RESERVED_LAYOUT_IDS = 1
const BYTES_PER_32BITS = 4

export const NULL_PTR = 0

export interface BaseNativeViewer<Self extends object> {
	p$: number
	l$: LayoutMap
	
	index(i: number): this
	toObject(): object
	isSome(): boolean
	isNone(): boolean
	unwrap(): this

	layoutId$(): number
	sizeof$(): number
	toLayout$(classId: number): this
	ptr$(): number
	cloneRef$(): Self
	mut$(): this
	ref$(): this
	move$(): this

	// native field properties won't actually be called this
	// but with will allow mutation of random properties
	// with number value
	[key: `_${string}`]: number;
}

// default layout is "Aos", which stands for struct of arrays. 
// Read more here: https://en.wikipedia.org/wiki/AoS_and_SoA
export interface NativeViewer extends BaseNativeViewer<NativeViewer> {
	o$: number
}
export type NativeViewerFactory = { new(): NativeViewer }

// "Soa" stands for struct of arrays. 
// Read more here: https://en.wikipedia.org/wiki/AoS_and_SoA
export interface NativeViewerSoa extends BaseNativeViewer<NativeViewerSoa> {
	o$: { v: number }
}
export type NativeViewerSoaFactory = { new(): NativeViewerSoa }

export type LayoutMap = {
	size$: number
	layoutId$: number
	[key: string & {}]: number /* eslint-disable-line @typescript-eslint/ban-types */
}

type LayoutMeta = {
    fields: string[]
    id: number
    sizeof: number
}

type NativeComponentMeta = {
    id: number
    layoutId: number
    name: string,
    fields: string[]
    /** measured in chunks of 4 bytes (32-bits), not 1 byte */
    sizeof: number
}

export type NativeComponentContext = {
	layoutMap: { 
		readonly new: () => LayoutMap, 
		readonly registry: readonly LayoutMap[] 
	}
    componentLayoutRegistry: Map<number, number>
    PointerViewI32: NativeViewerFactory
    PointerViewF32: NativeViewerFactory
    PointerViewSoaI32: NativeViewerSoaFactory
    PointerViewSoaF32: NativeViewerSoaFactory
	views: readonly (NativeViewerSoaFactory | NativeViewerFactory)[]
}

export type NativeDescriptor = Readonly<{
	id: number
    name: string,
    def: ComponentDefinition
}>

export function nativeComponentFactory(
	components: NativeDescriptor[],
	jsHeap: JsHeapRef
): NativeComponentContext {
	const uniqueFieldNames = new Set<string>()
	const componentMeta: NativeComponentMeta[] = []
	const layouts: LayoutMeta[] = []
	const layoutHashes = new Map<string, number>()
	const componentLayoutRegistry = new Map<number, number>()
	type LayoutRecord = { fields: string[] }
	const layoutComponentRecord = new Map<number, LayoutRecord>()
	for (const component of components) {
		const {def, id, name} = component
		const fields = orderKeys(component.def)
        
		let componentHash = ""
		for (const field of fields) {
			if (field.includes("$")) {
				continue
			}
			switch (field) {
			// beyond field names with "$" 
			// these are field name are also reserved
			case "index":
			case "toObject":
			case "isSome":
			case "isNone":
			case "unwrap":
				continue
			default:
				break
			}
			uniqueFieldNames.add(field)
			componentHash += `${field}:${def[field]},`
		}

		let layoutId = layoutHashes.size + RESERVED_LAYOUT_IDS
		const sizeof = fields.length
		if (!layoutHashes.has(componentHash)) {
			layouts.push({fields, id: layoutId, sizeof})
			layoutComponentRecord.set(layoutId, {fields})
			layoutHashes.set(componentHash, layoutId)
		} else {
			layoutId = layoutHashes.get(componentHash) || 0
		}
		componentLayoutRegistry.set(id, layoutId)
		componentMeta.push({
			fields, name, layoutId, sizeof, id
		})
	}

	const uniqueFieldList = [...uniqueFieldNames].sort()
	const baseLayout: LayoutMap = {size$: 0, layoutId$: 0}
	for (const unique of uniqueFieldList) {
		defineProp(baseLayout, unique, 0)
	}

	const layoutRegistry = [baseLayout]
	for (let i = 0; i < layouts.length; i++) {
		const meta = layouts[i]
		const {fields, id, sizeof} = meta
		const layout = {...baseLayout}
		layout.size$ = sizeof
		layout.layoutId$ = id
		for (let x = 0; x < fields.length; x++) {
			const field = fields[x]
			const offset = x
			defineProp(layout, field, offset)
		}
		layoutRegistry.push(layout)
	}

	const viewVariants: (keyof typeof jsHeap)[] = ["i32", "f32"]
	// "aos" stands for "array of structs"
	const aosClasses: NativeViewerFactory[] = []
	for (const variant of viewVariants) {
		let objectSwitch: (obj: NativeViewer, layoutId: number) => object
		{
			const layoutRecord = layoutComponentRecord
			let layoutSwitch = ""
			const obj = "obj"
			const layoutId = "layoutId"
			for (const [key, {fields}] of layoutRecord) {
				const jsObject = fields.reduce(
					(total, next) => `${total}"${next}":${obj}["${next}"],`,
					""
				)
				layoutSwitch += `case ${key}: return {${jsObject}};`
			}
			layoutSwitch += `default: {throw new Error(\`layout \${${layoutId}} doesn't exist\`)};`
			
			objectSwitch = Function(
				`return (${obj},${layoutId}) => {switch(${layoutId}){${layoutSwitch}}}`
			)()
		}

		class View implements NativeViewer {
			p$ = 0
			o$ = 0
			l$ = baseLayout
	
			index(i: number) { this.o$ = (i >>> 0) * this.l$.size$; return this }
			toObject(): object { return objectSwitch(this, this.l$.layoutId$) }
			isNone() { return this.p$ === NULL_PTR }
			isSome() { return this.p$ !== NULL_PTR }
			unwrap() { return this }

			toLayout$(classId: number) {
				this.l$ = layoutRegistry[componentLayoutRegistry.get(classId) || 0]
				return this
			}
			cloneRef$() {
				const ref = new View()
				ref.p$ = this.p$; ref.o$ = this.o$; ref.l$ = this.l$
				return ref
			}
			layoutId$() { return this.l$.layoutId$ }
			sizeof$() { return this.l$.size$ * BYTES_PER_32BITS }
			ptr$() { return this.p$ * BYTES_PER_32BITS }
			mut$() { return this }
			ref$() { return this }
			move$() { return this }

			[key: `_${string}`]: number;
		}
		defineProp(View, "name", `PointerView${variant.toUpperCase()}`)
		const h = jsHeap
		const [heapvar] = Object.keys({h})
		const heap = `${heapvar}.${variant}`
		type K = keyof View
		const ptrbase = `this.${<K>"p$"}+this.${<K>"o$"}+this.${<K>"l$"}`
		const proto = View.prototype
		for (const field of uniqueFieldList) {
			type Accessors = { get: () => number, set: (v: number) => void }
			const computePtr = `${ptrbase}["${field}"]`
			const getSet: Accessors = Function(
				heapvar, `return {
				get() {return ${heap}[${computePtr}]},
				set(v) {${heap}[${computePtr}] = v}
			}`)(jsHeap)
			Object.defineProperty(proto, field, getSet)
		}
		aosClasses.push(View)
	}

	const soaClasses: NativeViewerSoaFactory[] = []
	for (const variant of viewVariants) {
		let objectSwitch: (obj: NativeViewerSoa, layoutId: number) => object
		{
			const layoutRecord = layoutComponentRecord
			let layoutSwitch = ""
			const obj = "obj"
			const layoutId = "layoutId"
			for (const [key, {fields}] of layoutRecord) {
				const jsObject = fields.reduce(
					(total, next) => `${total}"${next}":${obj}["${next}"],`,
					""
				)
				layoutSwitch += `case ${key}: return {${jsObject}};`
			}
			layoutSwitch += `default: {throw new Error(\`layout \${${layoutId}} doesn't exist\`)};`
			
			objectSwitch = Function(
				`return (${obj},${layoutId}) => {switch(${layoutId}){${layoutSwitch}}}`
			)()
		}

		const defaultoffset = {v: 0}
		class View implements NativeViewerSoa {
			p$ = 0
			o$ = defaultoffset
			l$ = baseLayout
	
			index(i: number) { this.o$.v = i >>> 0; return this }
			toObject(): object { return objectSwitch(this, this.l$.layoutId$) }
			isNone() { return this.p$ === NULL_PTR }
			isSome() { return this.p$ !== NULL_PTR }
			unwrap() { return this }

			toLayout$(classId: number) {
				this.l$ = layoutRegistry[componentLayoutRegistry.get(classId) || 0]
				return this
			}
			cloneRef$() {
				const ref = new View()
				ref.p$ = this.p$; ref.o$ = {v: ref.o$.v}; ref.l$ = this.l$
				return ref
			}
			layoutId$() { return this.l$.layoutId$ }
			sizeof$() { return this.l$.size$ * BYTES_PER_32BITS }
			ptr$() { return this.p$ * BYTES_PER_32BITS }
			mut$() { return this }
			ref$() { return this }
			move$() { return this }

			[key: `_${string}`]: number;
		}
		defineProp(View, "name", `PointerViewSoa${variant.toUpperCase()}`)

		const h = jsHeap
		const [heapvar] = Object.keys({h})
		const heap = `${heapvar}.${variant}`
		const ptrview = `${heapvar}.${<keyof typeof h>"u32"}`
		type K = keyof View
		const ptrbase = `this.${<K>"p$"}+this.${<K>"l$"}`
		const proto = View.prototype

		for (const field of uniqueFieldList) {
			type Accessors = { get: () => number, set: (v: number) => void }
			const computePtr = `${ptrview}[${ptrbase}["${field}"]]+this.${<K>"o$"}.${<keyof View["o$"]>"v"}`
			const getSet: Accessors = Function(
				heapvar, `return {
				get() {return ${heap}[${computePtr}]},
				set(v) {${heap}[${computePtr}] = v}
			}`)(jsHeap)
			
			Object.defineProperty(proto, field, getSet)
		}
		soaClasses.push(View)
	}


	return {
		layoutMap: {
			new: () => ({...baseLayout}),
			registry: layoutRegistry
		},
		componentLayoutRegistry,
		PointerViewI32: aosClasses[0],
		PointerViewF32: aosClasses[1],
		PointerViewSoaI32: soaClasses[0],
		PointerViewSoaF32: soaClasses[1],
		views: [...aosClasses, ...soaClasses,]
	}
}

export const orderKeys = (def: ComponentDefinition) => Object.keys(def).sort()