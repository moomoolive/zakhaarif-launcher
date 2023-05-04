import type {
	ComponentDefinition, 
	ComponentToken,
	ComponentClass,
	JsHeapRef,
	ComponentFieldMeta,
	MutableComponentAccessor
} from "zakhaarif-dev-tools"

export const VALID_FIELD_TYPES = [
	"f32", "u32", "i32"
] as const satisfies readonly [ComponentToken, ComponentToken, ComponentToken]

type CompileResponse<Ok extends boolean = false> = {
    ok: Ok
    componentClass: Ok extends false ? null : ComponentClass
    msg: string
}

const compileRes: CompileResponse<true> | CompileResponse<false> = {
	ok: false,
	componentClass: null,
	msg: ""
}

/**
 * Repersents a view for a component on top of
 * a binary heap (anything that implments the JsHeapRef 
 * interface). 
 * Field names are intentionally small to increase
 * chance of accessor methods being inlined 
 * (V8 for instance takes into account the character
 * size of a method/function when deciding whether to inline
 * it. https://chromium.googlesource.com/v8/v8/+/refs/heads/lkgr/src/compiler/js-inlining-heuristic.cc)
 */
export type ComponentInternals = {
    /**
	 * pointer to struct of array
	 */
	p$: number
	/**
	 * a heap that holds the struct in question
	 */
    h$: JsHeapRef
	/**
	 * offset from pointer of the element 
	 * being inspected
	 */
    o$: number
}

const INTERNAL_FIELD_PREFIX = "$"

export const MAX_COMPONENT_FIELDS = 8

const COMPONENT_FIELD_ID_OFFSET = 10

export function computeFieldId(
	componentId: number, 
	fieldOffset: number
): number {
	return componentId * COMPONENT_FIELD_ID_OFFSET + fieldOffset
}

export function compileComponentClass<
	TName extends string = string,
    TDefinition extends ComponentDefinition = ComponentDefinition,
>(
	componentName: string,
	def: TDefinition,
	fullname: TName,
	id: number
): CompileResponse<true> | CompileResponse<false> {
	if (typeof def !== "object" || def === null) {
		compileRes.ok = false
		compileRes.msg =  `component definition must be an object. got ${def === null ? "null" : typeof def}`
		return compileRes
	}
	if (Array.isArray(def)) {
		compileRes.ok = false
		compileRes.msg = "component definition must be an object. got array"
		return compileRes
	}
	const initialTokens = []
	const keys = Object.keys(def)
	if (keys.length < 1) {
		compileRes.ok = false
		compileRes.msg = "component definition must have more than one field defined. Did you mean to create a tag component?"
		return compileRes
	}
	if (keys.length > MAX_COMPONENT_FIELDS) {
		compileRes.ok = false
		compileRes.msg = `component defintion can only have up to 8 fields, found ${keys.length}`
		return compileRes
	}
	for (let i = 0; i < keys.length; i++) {
		const name = keys[i]
		if (name.endsWith(INTERNAL_FIELD_PREFIX)) {
			compileRes.ok = false
			compileRes.msg = `component field "${name}" is an invalid field name. Field names cannot start with "@@" or be named "ptr"`
			return compileRes
		}
		const type = def[name]
		if (typeof type !== "string") {
			compileRes.ok = false
			compileRes.msg = `component field "${name}" type must be a string, got "${typeof type}"`
			return compileRes
		}
		switch (type) {
		case "f32":
		case "i32":
			break
		default:
			compileRes.ok = false
			compileRes.msg = `component field "${name}" is type "${type || "unknown"}" (type=${typeof type}) which is not a valid field type. Valid types are ${VALID_FIELD_TYPES.join(", ")}`
			return compileRes
		}
		initialTokens.push({name, type})
	}
    
	const tokens = initialTokens.sort(
		(a, b) => a.name.localeCompare(b.name)
	)
    
	function Component(
		this: ComponentInternals, 
		ptr: number,
		jsHeap: JsHeapRef
	) {
		this.p$ = ptr
		this.h$ = jsHeap
		this.o$ = 0
	}

	Object.defineProperty(Component, "name", {
		value: componentName,
		configurable: true,
		writable: false,
		enumerable: true
	})
	const componentPrototype: object = Object.create(null)
	Object.defineProperty(componentPrototype, "index", {
		value(this: ComponentInternals, index: number) {
			this.o$ = index
			return this
		},
		enumerable: true,
		configurable: true,
		writable: false
	})
	let sizeof = 0
	const fieldMeta: ComponentFieldMeta[] = []
	for (let i = 0; i < tokens.length; i++) {
		const {name, type} = tokens[i]
		const offset = i
		const fieldId = computeFieldId(id, offset)
		fieldMeta.push({name, offset, id: fieldId})
		sizeof += 32
		switch (type) {
		case "i32": {
			Object.defineProperty(componentPrototype, name, {
				get(this: ComponentInternals): number {
					return this.h$.i32[
					// get array pointer for field 
					// from heap.
						this.h$.u32[this.p$ + offset]
							// add offset of element being
							// inspected
							+ this.o$
					]
				},
				set(this: ComponentInternals, i32: number): void {
					this.h$.i32[this.h$.u32[this.p$ + offset] + this.o$] = i32
				},
			})
			Object.defineProperty(componentPrototype, `${name}Ptr`, {
				value(this: ComponentInternals): number {
					return this.h$.u32[this.p$ + offset]
				},
				enumerable: true,
				configurable: true,
				writable: false
			})
			break
		}
		case "f32": {
			Object.defineProperty(componentPrototype, name, {
				get(this: ComponentInternals): number {
					return this.h$.f32[this.h$.u32[this.p$ + offset] + this.o$]
				},
				set(this: ComponentInternals, f32: number): void {
					this.h$.f32[this.h$.u32[this.p$ + offset] + this.o$] = f32
				},
			})
			Object.defineProperty(componentPrototype, `${name}Ptr`, {
				value(this: ComponentInternals): number {
					return this.h$.u32[this.p$ + offset]
				},
				enumerable: true,
				configurable: true,
				writable: false
			})
			break
		}
		default:
			break
		}
	}
	Component.prototype = componentPrototype
	compileRes.ok = true
	type Factory = { 
		new(ptr: number, heap: JsHeapRef): MutableComponentAccessor<
			TName, TDefinition
		> 
	}
	const component: ComponentClass<TName, TDefinition> = {
		new: (objPtr, jsHeap) => new (Component as unknown as Factory)(objPtr, jsHeap),
		def,
		name: componentName,
		fullname,
		id,
		sizeof,
		fields: fieldMeta
	}
	compileRes.componentClass = component
	return compileRes
}