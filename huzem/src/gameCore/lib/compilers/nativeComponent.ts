import type {
	ComponentDefinition,
	JsHeapRef,
	//strict_u32, 
	//strict_i32,
} from "zakhaarif-dev-tools"

const RESERVED_LAYOUT_IDS = 1
const BYTES_PER_32BITS = 4

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
    componentId: number
    layoutId: number
    name: string,
    fields: string[]
    /** measured in chunks of 4 bytes (32-bits), not 1 byte */
    sizeof: number
}

export type ComponentRegisterMeta = Readonly<{
	componentId: number
    name: string,
    definition: ComponentDefinition
}>

export function nativeComponentFactory(
	components: ComponentRegisterMeta[],
	jsHeap: JsHeapRef
) {
	const defaultLayoutProps: (keyof LayoutMap)[] = [
		"layoutId$", "size$"
	]
	const uniqueFieldNames = new Set<string>(defaultLayoutProps)
	const componentMeta: NativeComponentMeta[] = []
	const layouts: LayoutMeta[] = []
	const layoutHashes = new Map<string, number>()
	const componentLayoutRegistry = new Map<number, number>()
	for (const component of components) {
		const {definition, componentId, name} = component
		const fields = Object.keys(definition).sort()
        
		let componentHash = ""
		for (const field of fields) {
			// components can't have field names with a "$"
			if (field.includes("$")) {
				continue
			}
			switch (field) {
			case "index":
			case "toObject":
				continue
			default:
				break
			}
			uniqueFieldNames.add(field)
			componentHash += `${field}:${definition[field]},`
		}

		let layoutId = layoutHashes.size + RESERVED_LAYOUT_IDS
		const sizeof = fields.length
		if (!layoutHashes.has(componentHash)) {
			layouts.push({fields, id: layoutId, sizeof})
		} else {
			layoutId = layoutHashes.get(componentHash) || 0
		}
		componentLayoutRegistry.set(componentId, layoutId)
		componentMeta.push({
			fields, name, layoutId, sizeof, componentId
		})
	}

	const uniqueFieldList = [...uniqueFieldNames].sort()
	const baseLayout: LayoutMap = {size$: 0, layoutId$: 0}
	for (let i = 0; i < uniqueFieldList.length; i++) {
		const unique = uniqueFieldList[i]
		Object.defineProperty(baseLayout, unique, {
			value: 0,
			enumerable: true,
			configurable: true,
			writable: false
		})
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
			Object.defineProperty(layout, field, {
				value: offset,
				enumerable: true,
				configurable: true,
				writable: false
			})
		}
		layoutRegistry.push(layout)
	}

	class PointerViewI32 {
		p$ = 0
		o$ = 0
		l$ = baseLayout

		index(i: number) {
			this.o$ = (i >>> 0) * this.l$.size$
			return this
		}
		toObject() {
			return {}
		}

		// dollar-sign methods
		layoutId$() { return this.l$.layoutId$ }
		sizeof$() { return this.l$.size$ }
		toLayout$(componentId: number) {
			this.l$ = layoutRegistry[componentLayoutRegistry.get(componentId) || 0]
			return this
		}
		ptr$() { return this.p$ * BYTES_PER_32BITS }
		setPtr$(ptr: number) { this.p$ = (ptr / BYTES_PER_32BITS) >>> 0 }
		cloneRef$() {
			const ref = new PointerViewI32()
			ref.p$ = this.p$; ref.o$ = this.o$; ref.l$ = this.l$
			return ref
		}
		mut$() { return this }
		ref$() { return this }
		move$() { return this }
	}

	let heap: string
	let computePtr: string
	{
		const h = jsHeap
		const [heapvar] = Object.keys({h})
		heap = `${heapvar}.${<keyof typeof h>"i32"}`
        type P = PointerViewI32
        computePtr = `this.${<keyof P>"p$"}+this.${<keyof P>"o$"}+this.${<keyof P>"l$"}`
	}
	for (const field of uniqueFieldList) {
        type Accessors = { get: () => number, set: (v: number) => void }
        const getSet: Accessors = eval(`{
            get() {return ${heap}[${computePtr}['${field}']]},
            set(v) {${heap}[${computePtr}['${field}']] = v}
        }`)
        Object.defineProperty(PointerViewI32.prototype, field, getSet)
	}
}
