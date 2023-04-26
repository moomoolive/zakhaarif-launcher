import type {System} from "./index"
import {sweepBoxCollisions} from "./lib/physics/index"
import {Vector3, Quaternion} from "babylonjs"
import {
	lerp, toDegrees,
	toRadians,
	fpEqual,
	createAxisRotation
} from "./lib/math/index"

export const playerController: System = (engine) => {
	const {zakhaarifStd} = engine.mods
	const {movementVec} = zakhaarifStd.useMutState()
	const {camera, controller} = zakhaarifStd.useState()

	movementVec.horizontal = 0
	movementVec.vertical = 0

	if (controller.forward) {
		movementVec.horizontal += Math.cos(Math.PI - camera.alpha)
		movementVec.vertical += Math.sin(Math.PI - camera.alpha)
	}

	if (controller.backward) {
		movementVec.horizontal += Math.cos(Math.PI * 2 - camera.alpha)
		movementVec.vertical += Math.sin(Math.PI * 2 - camera.alpha)
	}

	if (controller.left) {
		movementVec.horizontal += Math.cos(Math.PI / 2 - camera.alpha)
		movementVec.vertical += Math.sin(Math.PI / 2 - camera.alpha)
	}

	if (controller.right) {
		movementVec.horizontal += Math.cos(3 * Math.PI / 2 - camera.alpha)
		movementVec.vertical += Math.sin(3 * Math.PI / 2 - camera.alpha)
	} 
    
	const moveAngleRadians = Math.atan2(movementVec.vertical, movementVec.horizontal)
	movementVec.angle = toDegrees(moveAngleRadians)
}

export const processMouseInput: System = (engine) => {
	const deltaTime = engine.std.time.deltaTime()
	const {zakhaarifStd} = engine.mods
	const {
		camera,
		controller,
		mouseMovement
	} = zakhaarifStd.useMutState()

	const {
		deltaDegreesX, currentXDegrees, 
		deltaDegreesY, currentYDegrees
	} = mouseMovement
    
	if (currentXDegrees > deltaDegreesX) {
		controller.cameraLeft = true
		const t = 1 - Math.pow(0.001, deltaTime)
		const newXDegrees = lerp(
			Math.abs(currentXDegrees), Math.abs(deltaDegreesX), t
		)
		const degreeDiff = newXDegrees - currentXDegrees
		mouseMovement.currentXDegrees -= degreeDiff
		controller.frameCameraXRotation = degreeDiff
	} else {
		controller.cameraLeft = false
	}

	if (currentXDegrees < deltaDegreesX) {
		controller.cameraRight = true
		const t = 1 - Math.pow(0.001, deltaTime)
		const newXDegrees = lerp(
			currentXDegrees, deltaDegreesX, t
		)
		const degreeDiff = newXDegrees - currentXDegrees
		mouseMovement.currentXDegrees += degreeDiff
		controller.frameCameraXRotation = degreeDiff
	} else {
		controller.cameraRight = false
	}

	if (currentYDegrees > deltaDegreesY) {
		controller.cameraDown = true
		const t = 1 - Math.pow(0.001, deltaTime)
		const newYDegrees = lerp(
			Math.abs(deltaDegreesY), Math.abs(deltaDegreesY), t
		)
		const degreeDiff = newYDegrees - currentXDegrees
		mouseMovement.currentYDegrees -= degreeDiff
		controller.frameCameraYRotation = degreeDiff
	} else {
		controller.cameraDown = false
	}

	if (currentYDegrees < deltaDegreesY) {
		controller.cameraUp = true
		const t = 1 - Math.pow(0.001, deltaTime)
		const newYDegrees = lerp(
			deltaDegreesY, deltaDegreesY, t
		)
		const degreeDiff = newYDegrees - currentXDegrees
		mouseMovement.currentYDegrees += degreeDiff
		controller.frameCameraYRotation = degreeDiff
	} else {
		controller.cameraUp = false
	}

	if (controller.cameraZoomIn) {
		camera.radius += 2.0
		controller.cameraZoomIn = false 
	} else if (controller.cameraZoomOut) {
		camera.radius -= 2.0
		controller.cameraZoomOut = false
	}
}

export const cameraPosition: System = (engine) => {
	const {zakhaarifStd} = engine.mods

	const {camera} = zakhaarifStd.useMutState()
	const {controller, playerEntity} = zakhaarifStd.useState()

	if (controller.cameraLeft) {
		camera.alpha += controller.frameCameraXRotation
	} else if (controller.cameraRight) {
		camera.alpha -= controller.frameCameraXRotation
	}
	if (controller.cameraUp && camera.beta < Math.PI / 1.98) {
		camera.beta += controller.frameCameraYRotation
	} else if (controller.cameraDown) {
		camera.beta -= controller.frameCameraYRotation
	}

	const {x, y, z} = playerEntity.position
	camera.target.set(x, y + 1.5, z)
}

const GRAVITY = 1_080.0
const deceleration = new Vector3(-10.0, -0.0001, -10.0)

export const movement: System = (engine) => {
	const {zakhaarifStd} = engine.mods
	const {
		playerEntity: {
			velocity: playerVelocity,
			impulse: playerImpluse
		}, 
		playerStats,
		activeMeshes
	} = zakhaarifStd.useMutState()
	const {
		controller, 
		movementVec,
		playerEntity
	} = zakhaarifStd.useState()

	const player = activeMeshes[playerEntity.rendering.id]
	const deltaTime = engine.std.time.deltaTime()
	const deltaSeconds = deltaTime * 0.0001

	const frameDecleration = new Vector3(
		playerVelocity.x * deceleration.x,
		playerVelocity.y * deceleration.y,
		playerVelocity.z * deceleration.z,
	)
	frameDecleration.x *= deltaSeconds
	frameDecleration.y *= deltaSeconds
	frameDecleration.z *= deltaSeconds
	frameDecleration.z = (
		Math.sign(frameDecleration.z) 
        * Math.min(Math.abs(frameDecleration.z), Math.abs(playerVelocity.z))
	)

	playerVelocity.x += frameDecleration.x
	playerVelocity.y += frameDecleration.y
	playerVelocity.z += frameDecleration.z

	if (
		controller.forward 
        || controller.backward 
        || controller.left 
        || controller.right
	) {
		playerVelocity.z += playerEntity.acceleration.z * deltaSeconds * - movementVec.vertical
		playerVelocity.x += playerEntity.acceleration.x * deltaSeconds * movementVec.horizontal

		/* I cannot get the model to line up with camera for some reason
            fix this later
        */
		const angleRotation = movementVec.angle + 90.0
		if (!fpEqual(playerStats.rotation, angleRotation, 0.5)) {
			const t = 1 - Math.pow(0.99, deltaTime)
			/* player rotation change code */
			const rotation = Quaternion.Slerp(
                player.rotationQuaternion as Quaternion,
                createAxisRotation(0.0, 1.0, 0.0, toRadians(movementVec.angle + 90.0)),
                t
			)
			playerStats.rotation = toDegrees(rotation.toEulerAngles().y)
			player.rotationQuaternion = rotation
		}

	}

	if (controller.up) {
		playerImpluse.y += playerEntity.kinematics.mass * (GRAVITY * deltaSeconds * 2.0)
	}
}

export const physics: System = (engine) => {
	const {zakhaarifStd} = engine.mods

	const {
		impulse, 
		velocity, 
		transform
	} = zakhaarifStd.useMutState().playerEntity

	const {
		kinematics, 
		position, 
		collider,
	} = zakhaarifStd.useState().playerEntity

	velocity.x += impulse.x / kinematics.mass
	velocity.y += impulse.y / kinematics.mass
	velocity.z += impulse.z / kinematics.mass

	impulse.x = impulse.y = impulse.z = 0.0
	const deltaSeconds = engine.std.time.deltaTime() * 0.0001

	const {transform: diff} = sweepBoxCollisions(
		position,
		collider, 
		{isVoxelSolid: (_x, _y, _z) => false},
		velocity.x * deltaSeconds,
		velocity.y * deltaSeconds,
		velocity.z * deltaSeconds,
	)

	transform.x = diff.x
	transform.y = diff.y
	transform.z = diff.z
}

export const applyTransforms: System = (engine) => {
	const {zakhaarifStd} = engine.mods
	const {position} = zakhaarifStd.useMutState().playerEntity
	const {transform} = zakhaarifStd.useState().playerEntity
	position.x += transform.x
	position.y += transform.y
	position.z += transform.z
}

export const visualChanges: System = ({mods}) => {
	const {zakhaarifStd} = mods
	const {activeMeshes} = zakhaarifStd.useMutState()
	const {rendering, position} = zakhaarifStd.useState().playerEntity
	const mesh = activeMeshes[rendering.id]
	mesh.position.x = position.x
	mesh.position.z = position.z
	mesh.position.y = position.y
	
	/*const {player} = zakhaarifStd.useArchetype()
	const {zakhaarifStd_rendering, zakhaarifStd_position} = player.useComponents()
	const len = player.entityCount()
	for (let i = 0; i < len; i++) {
		const rendering = zakhaarifStd_rendering.index(i)
		const position = zakhaarifStd_position.index(i)
		const mesh = activeMeshes[rendering.id]
		mesh.position.x = position.x
		mesh.position.y = position.y
		mesh.position.z = position.z
	}

	const quickEntity = player.initEntity().create()
	const buildEnt = player.initEntity()
	buildEnt.zakhaarifStd_acceleration.x = 2.0
	buildEnt.zakhaarifStd_acceleration.y = 5.5
	buildEnt.zakhaarifStd_position.x = 0.0
	const e2 = buildEnt.create()*/
}

export const render: System = ({mods}) => {
	const {scene} = mods.zakhaarifStd.useMutState()
	scene.render()
}