import type {
	ComponentDefinition, 
	ComponentToken,
	ComponentClass,
	JsHeapRef
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

export type ComponentInternals = {
    "@@ptr": number
    "@@heap": JsHeapRef
    "@@offset": number
}

export function compileComponentClass<
    D extends ComponentDefinition = ComponentDefinition
>(
	componentName: string,
	def: D,
	fullname: string,
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
	for (let i = 0; i < keys.length; i++) {
		const name = keys[i]
		const type = def[name]
		if (typeof type !== "string") {
			compileRes.ok = false
			compileRes.msg = `component field "${name}" type must be a string, got "${typeof type}"`
			return compileRes
		}
		switch (type) {
		case "f32":
		case "i32":
		case "u32":
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
		this["@@ptr"] = ptr
		this["@@heap"] = jsHeap
		this["@@offset"] = 0
	}

	Object.defineProperty(Component, "name", {
		value: componentName,
		configurable: true,
		writable: false,
		enumerable: true
	})
	Object.defineProperty(Component, "def", {
		value: def,
		configurable: true,
		writable: false,
		enumerable: true
	})
	Object.defineProperty(Component, "fullname", {
		value: fullname,
		configurable: true,
		writable: false,
		enumerable: true
	})
	Object.defineProperty(Component, "id", {
		value: id,
		configurable: true,
		writable: false,
		enumerable: true
	})
	const componentPrototype: object = Object.create(null)
	Object.defineProperty(componentPrototype, "index", {
		value(this: ComponentInternals, index: number) {
			this["@@offset"] = index
			return this
		},
		enumerable: true,
		configurable: true,
		writable: false
	})
	for (let i = 0; i < tokens.length; i++) {
		const {name, type} = tokens[i]
		const offset = i
		switch (type) {
		case "i32": {
			Object.defineProperty(componentPrototype, name, {
				get(this: ComponentInternals): number {
					return this["@@heap"].i32[this["@@heap"].u32[this["@@ptr"] + offset] + this["@@offset"]]
				},
				set(this: ComponentInternals, i32: number): void {
					this["@@heap"].i32[this["@@heap"].u32[this["@@ptr"] + offset] + this["@@offset"]] = i32
				},
			})
			Object.defineProperty(componentPrototype, `${name}Ptr`, {
				value(this: ComponentInternals): number {
					return this["@@heap"].u32[this["@@ptr"] + offset]
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
					return this["@@heap"].f32[this["@@heap"].u32[this["@@ptr"] + offset] + this["@@offset"]]
				},
				set(this: ComponentInternals, f32: number): void {
					this["@@heap"].f32[this["@@heap"].u32[this["@@ptr"] + offset] + this["@@offset"]] = f32
				},
			})
			Object.defineProperty(componentPrototype, `${name}Ptr`, {
				value(this: ComponentInternals): number {
					return this["@@heap"].u32[this["@@ptr"] + offset]
				},
				enumerable: true,
				configurable: true,
				writable: false
			})
			break
		}
		case "u32": {
			Object.defineProperty(componentPrototype, name, {
				get(this: ComponentInternals): number {
					return this["@@heap"].u32[this["@@heap"].u32[this["@@ptr"] + offset] + this["@@offset"]]
				},
				set(this: ComponentInternals, u32: number): void {
					this["@@heap"].u32[this["@@heap"].u32[this["@@ptr"] + offset] + this["@@offset"]] = u32
				},
			})
			Object.defineProperty(componentPrototype, `${name}Ptr`, {
				value(this: ComponentInternals): number {
					return this["@@heap"].u32[this["@@ptr"] + offset]
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
	compileRes.componentClass = Component as unknown as ComponentClass<D>
	return compileRes
}