//import {main} from "./main"
import {mod} from "zakhaarif-dev-tools"

const linkedMod = mod().create({
	alias: "zakhaarif.com/huzem/standardMod",
	state: ({canonicalUrl, resolvedUrl}) => {
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
	onBeforeGameLoop: (engine) => {
		const {mods} = engine
	},
})

export type ModType = typeof linkedMod

export default linkedMod