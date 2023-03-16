//import {main} from "./main"
import {mod} from "zakhaarif-dev-tools"

const linkedMod = mod().create({
	alias: "zakhaarif.com/huzem/standardMod",
	state: () => {
		return {
			transform: {x: 0.0, y: 0.0, z: 0.0},
			impulse: {x: 0.0, y: 0.0, z: 0.0},
			collider: {x: 0.5, y: 1.0, z: 0.5},
			kinematics: {mass: 10.0, gravityModifier: 1.0},
			velocity: {x: 0.0, y: 0.0, z: 0.0},
			acceleration: {x: 2_000.0, y: 0.25, z: 2_000.0},
			position: {x: 2_048.0, y: 100.0, z: 2_048.0},
			rendering: {id: 0},
		}
	},
	onInit: (meta) => {
		console.info("init called with meta", meta)
	},
	onBeforeGameLoop: (engine) => {
		console.info("before game loop called", engine)
		const {mods} = engine
		engine.ecs.addSystem(() => {
			console.info("system called")
			console.info("mods", mods)
			console.info("my mod", mods["zakhaarif.com/huzem/standardMod"])
		})
	},
})

export type ModType = typeof linkedMod

export default linkedMod