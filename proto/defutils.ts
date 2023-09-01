export const def = {
	struct: <T extends StructDef>(o: T) => o,
	uievent: (name: string) => ({
		new: (x = 0, y = 0, z = 0) => ({
			x: 0, y: 0, z: 0, publish: () => true
		}),
		addListener: (fn: (data: {x: number, y: number, z: number}) => unknown) => {
			return 0
		},
		removeListener: (id: number) => true
	}),
	i32: "i32",
} as const

export const std = {
	stack: {
		i8x4: {
			default: () => 0,
			new: (f1: number, f2: number, f3: number, f4: number) => 0,
			get: (tup: number, f: 0 | 1 | 2 | 3) => 0,
			uget: (tup: number, f: 0 | 1 | 2 | 3) => 0,
			set: (tup: number, f: 0 | 1 | 2 | 3, val: number) => 0,
			inc: (tup: number, f: 0 | 1 | 2 | 3, val: number) => 0,
		},
		i16x2: {
			default: () => 0,
			new: (f1: number, f2: number) => 0,
			get: (tup: number, f: 0 | 1) => 0
		}
	},
	wasmStr: {
		ascii: (str: string) => 0,
		utf8: (str: string) => 0
	},
	u8: (num: number) => num | 0,
} as const

type StructDef = {
    [key: string]: "i32" | "f32"
}