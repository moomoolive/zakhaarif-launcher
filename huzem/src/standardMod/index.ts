import {
	Zutils,
	modData,
	initMod,
} from "zakhaarif-dev-tools"
import {stateHandler} from "./events"
import {
	render,
	visualChanges,
	physics,
	applyTransforms,
	movement,
	cameraPosition,
	processMouseInput,
	playerController
} from "./systems"
import {DebugLayer} from "babylonjs"

const data = modData().define({
	name: "zakhaarifStd",
	state: stateHandler,
	components: {
		transform: {x: "f32", y: "f32", z: "f32"},
		velocity: {x: "f32", y: "f32", z: "f32"},
		acceleration: {x: "f32", y: "f32", z: "f32"},
		position: {x: "f32", y: "f32", z: "f32"},
		impulse: {x: "f32", y: "f32", z: "f32"},
		kinematics: {mass: "f32", gravityModifier: "f32"},
		collider: {x: "f32", y: "f32", z: "f32"},
		rendering: {id: "i32"}
	},
	queries: {
		visualChanges: {
			zakhaarifStd_position: "required",
			zakhaarifStd_rendering: "required"
		}
	},
	archetypes: {
		player: {
			zakhaarifStd_transform: {},
			zakhaarifStd_impulse: {},
			zakhaarifStd_collider: {x: 0.5, y: 1.0, z: 0.5},
			zakhaarifStd_kinematics: {mass: 10.0, gravityModifier: 1.0},
			zakhaarifStd_velocity: {},
			zakhaarifStd_acceleration:  {x: 2_000.0, y: 0.25, z: 2_000.0},
			zakhaarifStd_position: {x: 2_048.0, y: 100.0, z: 2_048.0},
			zakhaarifStd_rendering: {}
		}
	}
})

export type Utils = Zutils<typeof data>
export type System = Utils["System"]

export const mod = initMod({
	data,
	onInit: (meta) => {
		console.info("init called with meta", meta)
	},
	onBeforeGameLoop: (engine) => {
		console.info("before game loop called", engine)

		const canvas = engine.getRootCanvas()
		canvas.style.width = "100vw"
		canvas.style.height = "100vh"
		canvas.onclick = () => canvas.requestPointerLock()

		const {zakhaarifStd} = engine.useMod()
		const state = zakhaarifStd.useMutState()

		const {skybox, controller} = state
		skybox.setEnabled(true)
		console.info("IMPORT META", import.meta.url)
		DebugLayer.InspectorURL = new URL(
			"/debug/babylonjs-inspector.js", 
			zakhaarifStd.useMetadata().resolvedUrl
		).href

		window.addEventListener("keydown", (e) => {
			if (e.repeat) {
				return
			}
			switch(e.key) {
			case "w":
				controller.forward = true
				break
			case "s":
				controller.backward = true
				break
			case "a":
				controller.left = true
				break
			case "d":
				controller.right = true
				break
			case "q":
				controller.interact = true
				break
			case "z":
				controller.invertTool = true
				break
			case " ":
				controller.up = true
				break
			}
		})

		window.addEventListener("keyup", (e) => {
			if (e.repeat) {
				return
			}
			switch(e.key) {
			case "w":
				controller.forward = false
				break
			case "s":
				controller.backward = false
				break
			case "a":
				controller.left = false
				break
			case "d":
				controller.right = false
				break
			case "q":
				controller.interact = false
				break
			case "z":
				controller.invertTool = false
				break
			case " ":
				controller.up = false
				break
			}
		})

		const {mouseMovement} = state

		window.addEventListener("mousemove", (e) => {
			const move = mouseMovement
			move.currentXDegrees = 0.0
			move.currentYDegrees = 0.0
			const degreesPerPixel = 0.005
			move.deltaDegreesX = e.movementX * degreesPerPixel
			move.deltaDegreesY = e.movementY * degreesPerPixel
		})

		window.addEventListener("wheel", (e) => {
			const scroll = e.deltaY
			if (scroll < 0) {
				controller.cameraZoomIn = true
			} else {
				controller.cameraZoomOut = true
			}
		})

		const {babylonJsEngine} = state
	
		window.addEventListener("resize", () => {
			babylonJsEngine.resize()
		})

		const {
			playerEntity, 
			lodSystemState, 
			chunkManager
		} = state

		{
			const minChunkSize = 16

			const {x, z} = playerEntity.position
			const xDiff = x % minChunkSize
			const xbase = x - xDiff
			lodSystemState.boundaryX.lower = xbase
			lodSystemState.boundaryX.upper = xbase + minChunkSize
			const zDiff = z % minChunkSize
			const zbase = z - zDiff
			lodSystemState.boundaryZ.lower = zbase
			lodSystemState.boundaryZ.upper = zbase + minChunkSize
	
			chunkManager.diffChunks(x, z)
			while (chunkManager.hasTasks()) {
				chunkManager.execPendingTask()
			}
			console.info(
				"[stats]: vertices", chunkManager.vertexCount().toLocaleString(),
				", faces", chunkManager.faceCount().toLocaleString(),
				", chunks", chunkManager.chunkCount().toLocaleString()
			)
			console.info(
				"[stats]: avg mesh time", chunkManager.averageMeshTime(),
				"ms, avg skirt time", chunkManager.averageSkirtTime(),
				"ms"
			)
			//chunkManager.showTerrainSurrounding()
			//chunkManager.showWater()
		}
		
		engine.ecs.addSystem(playerController)
		engine.ecs.addSystem(processMouseInput)
		engine.ecs.addSystem(cameraPosition)
		engine.ecs.addSystem(movement)
		engine.ecs.addSystem(physics)
		engine.ecs.addSystem(applyTransforms)
		engine.ecs.addSystem(visualChanges)
		engine.ecs.addSystem(render)

		engine.addConsoleCommand({
			name: "gldebugger",
			args: {show: "boolean?"},
			fn: (gameEngine, input) => {
				if (input.show === undefined) {
					return "no valid options detected"
				}
				const {scene} = gameEngine.useMod().zakhaarifStd.useMutState()
				if (!input.show) {
					scene.debugLayer.hide()
					return "closed"
				}
				scene.debugLayer.show({
					embedMode: true,
					overlay: true,
				})
				return "opened"
			}
		})
	},
})

