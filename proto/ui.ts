import {def, std} from "./defutils"

const {i8x4, i16x2} = std.stack
const {wasmStr} = std 

const Vec3 = def.struct({x: def.i32, y: def.i32, z: def.i32})
const v = def.struct({x: "i32", y: "i32", z: "i32"})

const pkgname = wasmStr.ascii("hello_world")
const msg = wasmStr.utf8("herro 🫶")

const ui = {
	run_handler: (fn: (w: typeof window) => void) => {

	},
	document: {
		title: () => "",
		set_title: (title: string) => true
	},
	meta: {
		import: {url: () => "hello"} as const
	}
}

const sys = () => {
	let tup = i8x4.new(0, 1, 2, 4)
	tup = i8x4.inc(tup, 0, 2)
	const tup2 = i16x2.new(7, 7)
	const ret = wasm_ffi(
		std.u8(i8x4.get(tup, 0)), 
		i8x4.uget(tup, 1), 
		i16x2.get(tup2, 0)
	)
	const state = 0
	ui.run_handler((win) => {
		const div = win.document.createElement("div")
		div.textContent = state.toString() + ui.document.title()
		win.document.body.appendChild(div)
		ui.document.set_title("hello")
		const url = ui.meta.import.url()
	})
}

function wasm_ffi(my_u8: number, an_u8: number, my_i16: number) {
	return 0
}

const coolevt = def.uievent("cool-event")

const uisys = () => {
	const msg = coolevt.new()
	msg.x = 0.0
	msg.publish()
}

const domsys = () => {
	const domnode = document.createElement("div")
	const id = coolevt.addListener((msg) => {
		domnode.textContent = msg.x.toString()
	})
	window.setTimeout(() => coolevt.removeListener(id), 10)
}