import type {GameSystem} from "./index"
import {sweepBoxCollisions} from "./lib/physics/index"
import {Vector3, Quaternion} from "babylonjs"
import {
	lerp, toDegrees,
	toRadians,
	fpEqual,
	createAxisRotation
} from "./lib/math/index"

export const playerController: GameSystem = (engine) => {
	const {
		movementVec, 
		controller, 
		camera
	} = engine.state().zakhaarifStd
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

export const processMouseInput: GameSystem = (engine) => {
	const deltaTime = engine.getDeltaTime()
	const {
		mouseMovement, 
		camera,
		controller
	} = engine.state().zakhaarifStd

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

export const cameraPosition: GameSystem = (engine) => {
	const {
		controller, 
		camera, 
		playerEntity
	} = engine.state().zakhaarifStd
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

export const movement: GameSystem = (engine) => {
	const {
		playerEntity, 
		controller,
		playerStats,
		movementVec,
		activeMeshes
	} = engine.state().zakhaarifStd

	const player = activeMeshes[playerEntity.rendering.id]
	const deltaTime = engine.getDeltaTime()
	const deltaSeconds = deltaTime * 0.0001

	const frameDecleration = new Vector3(
		playerEntity.velocity.x * deceleration.x,
		playerEntity.velocity.y * deceleration.y,
		playerEntity.velocity.z * deceleration.z,
	)
	frameDecleration.x *= deltaSeconds
	frameDecleration.y *= deltaSeconds
	frameDecleration.z *= deltaSeconds
	frameDecleration.z = (
		Math.sign(frameDecleration.z) 
        * Math.min(Math.abs(frameDecleration.z), Math.abs(playerEntity.velocity.z))
	)

	playerEntity.velocity.x += frameDecleration.x
	playerEntity.velocity.y += frameDecleration.y
	playerEntity.velocity.z += frameDecleration.z

	if (
		controller.forward 
        || controller.backward 
        || controller.left 
        || controller.right
	) {
		playerEntity.velocity.z += playerEntity.acceleration.z * deltaSeconds * - movementVec.vertical
		playerEntity.velocity.x += playerEntity.acceleration.x * deltaSeconds * movementVec.horizontal

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

	const {impulse, kinematics} = playerEntity
	if (controller.up) {
		impulse.y += kinematics.mass * (GRAVITY * deltaSeconds * 2.0)
	}
}

export const physics: GameSystem = (engine) => {
	const {playerEntity} = engine.state().zakhaarifStd

	const {impulse, velocity, kinematics} = playerEntity

	velocity.x += impulse.x / kinematics.mass
	velocity.y += impulse.y / kinematics.mass
	velocity.z += impulse.z / kinematics.mass

	impulse.x = impulse.y = impulse.z = 0.0
	const deltaSeconds = engine.getDeltaTime() * 0.0001

	const res = sweepBoxCollisions(
		playerEntity.position,
		playerEntity.collider, 
		{isVoxelSolid: (_x, _y, _z) => false},
		playerEntity.velocity.x * deltaSeconds,
		playerEntity.velocity.y * deltaSeconds,
		playerEntity.velocity.z * deltaSeconds,
	)
	const {transform} = res

	playerEntity.transform.x = transform.x
	playerEntity.transform.y = transform.y
	playerEntity.transform.z = transform.z
}

export const applyTransforms: GameSystem = (engine) => {
	const {playerEntity} = engine.state().zakhaarifStd
	playerEntity.position.x += playerEntity.transform.x
	playerEntity.position.y += playerEntity.transform.y
	playerEntity.position.z += playerEntity.transform.z
}

export const visualChanges: GameSystem = (engine) => {
	const {playerEntity, activeMeshes} = engine.state().zakhaarifStd
	const playerMesh = activeMeshes[playerEntity.rendering.id]
	playerMesh.position.x = playerEntity.position.x
	playerMesh.position.z = playerEntity.position.z
	playerMesh.position.y = playerEntity.position.y
}

export const render: GameSystem = (engine) => {
	const {scene} = engine.state().zakhaarifStd
	scene.render()
	console.info("render called")
}