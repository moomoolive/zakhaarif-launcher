import {
	Scene, 
	Engine,
	Vector3,
	MeshBuilder,
	Mesh,
	SceneLoader,
	ArcRotateCamera,
	Quaternion,
	CreateBox,
	DirectionalLight,
	Database,
	Camera
} from "babylonjs"
import {SkyMaterial} from "babylonjs-materials" // for skybox
import "babylonjs-loaders" // for gltf loader
import {
	sweepBoxCollisions, 
	//CollisionInfo
} from "./lib/physics/index"
import {
	lerp, toRadians, toDegrees, fpEqual, 
	createAxisRotation
} from "./lib/math/index"
import {TerrainManager} from "./lib/graphics/terrainManager"
import {
	HeightMap, 
	biome,
	TERRAIN_MAX_X,
	TERRAIN_MAX_Y,
	TERRAIN_MAX_Z
} from "./lib/terrain/index"
import {VoxelColliders} from "./lib/physics/voxelColliders"

const deceleration = new Vector3(-10.0, -0.0001, -10.0)
const ROOT_URL = import.meta.env.DEV
	? "http://localhost:7888"
	: "https://preview.zakhaarif.com"

export const main = async (canvas: HTMLCanvasElement) => {
	console.log("📦 mod imported")
	canvas.style.width = "100vw"
	canvas.style.height = "100vh"
    
	const engine = new Engine(canvas, true, {
		adaptToDeviceRatio: true,
		powerPreference: "high-performance",
	})
    
	// turn off all systems that 
	// use indexeddb, as they will fail 
	// in sandboxed iframe.
	// caching will be dealt with 
	// in a different way...
	engine.enableOfflineSupport = false
	engine.disableManifestCheck = true
	Database.IDBStorageEnabled = false

	const scene = new Scene(engine, {})
	scene.debugLayer.show({embedMode: true})
    
	const camera = new ArcRotateCamera(
		"camera", 
		-Math.PI / 2,
		1.2,
		35,
		new Vector3(0, 1, 0),
	)
	camera.lowerBetaLimit = 0.1
	camera.attachControl(canvas, true)
	camera.inputs.clear()
	const sun = new DirectionalLight(
		"sun", new Vector3(0.2, -1.0, 0.0), scene
	)
	sun.intensity = 1.0
    

	const skyMaterial = new SkyMaterial("sky", scene)
	skyMaterial.backFaceCulling = false
	skyMaterial.turbidity = 20
	skyMaterial.luminance = 0.1
	skyMaterial.inclination = 0.5
	skyMaterial.azimuth = 0.25
	const skybox = MeshBuilder.CreateBox("skyBox", {
		size: 11_000
	}, scene)
	skybox.infiniteDistance = true
	//skybox.position.set(1_024, 0, 1_024)
	skybox.material = skyMaterial
	skybox.setEnabled(true)

	const controller = {
		left: false,
		right: false,
		forward: false,
		backward: false,
		up: false,
		down: false,
		frameCameraXRotation: 0.0,
		cameraLeft: false,
		cameraRight: false,
		frameCameraYRotation: 0.0,
		cameraUp: false,
		cameraDown: false,
		cameraZoomIn: false,
		cameraZoomOut: false,
		interact: false,
		invertTool: false,
	}

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

	const mouseMovement = {
		deltaDegreesX: 0.0,
		deltaDegreesY: 0.0,
		currentXDegrees: 0.0,
		currentYDegrees: 0.0,
	}

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

	window.addEventListener("resize", () => engine.resize())

	const playerStats = {
		rotation: 0
	}

	canvas.onclick  = () => canvas.requestPointerLock()

	const playerEntity = {
		transform: {x: 0.0, y: 0.0, z: 0.0},
		impulse: {x: 0.0, y: 0.0, z: 0.0},
		collider: {x: 0.5, y: 1.0, z: 0.5},
		kinematics: {mass: 10.0, gravityModifier: 1.0},
		velocity: {x: 0.0, y: 0.0, z: 0.0},
		acceleration: {x: 2_000.0, y: 0.25, z: 2_000.0},
		position: {x: 2_048.0, y: 100.0, z: 2_048.0},
		rendering: {id: 0},
	}
	const rawHeightMapJson = await fetch(`${ROOT_URL}/large-assets/misc/terrain-16bit.json`)

	const rawHeightMap = await rawHeightMapJson.json() as {
        height: number
        width: number
        high: number
        data: number[]
    }
	const heightMap = new HeightMap(rawHeightMap)
	console.info(`imported height map (${heightMap.height},${heightMap.width}), with ${heightMap.uniqueDataPoints()} data points`)
	console.log("chunking starting...")
	const chunkStart = Date.now()
	const colliders = VoxelColliders.fromHeightMap(
		heightMap, 
		TERRAIN_MAX_Y, 
		TERRAIN_MAX_X, 
		TERRAIN_MAX_Z, 
		biome
	)
	console.info(`[stats]: chunking took ${((Date.now() - chunkStart) / 1_000).toLocaleString()}s`)
    
	const chunkManager = new TerrainManager({colliders})

	const lodSystemState = {
		boundaryX: {
			upper: 0,
			lower: 0
		},
		boundaryZ: {
			upper: 0,
			lower: 0
		}
	}

	const minChunkSize = 16

	{
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

	const p = await SceneLoader.ImportMeshAsync(
		null, 
		`${ROOT_URL}/large-assets/misc/bfdi-nine/source/`,
		"model.gltf", 
		scene,
	)
	const player = p.meshes[0] as Mesh
	//const player = CreateBox("boxCollider", {
	//    width: playerEntity.collider.x * 2,
	//    height: playerEntity.collider.y * 2,
	//    depth: playerEntity.collider.z * 2,
	//}, scene)
	player.position.y -= 1.0
	{
		(player.rotationQuaternion as Quaternion).multiplyInPlace(
			createAxisRotation(0.0, 1.0, 0.0, Math.PI)
		)
	}
	player.bakeCurrentTransformIntoVertices()
	player.position = new Vector3(
		playerEntity.position.x, 
		playerEntity.position.y, 
		playerEntity.position.z
	)

	const boxCollider = CreateBox("boxCollider", {
		width: playerEntity.collider.x * 2,
		height: playerEntity.collider.y * 2,
		depth: playerEntity.collider.z * 2,
	}, scene)
	boxCollider.position.x = playerEntity.position.x
	boxCollider.position.y = playerEntity.position.y
	boxCollider.position.z = playerEntity.position.z

	const activeMeshes = [player, boxCollider]

	const GRAVITY = 1_080.0//9.8

	const movementVec = {horizontal: 0, vertical: 0, angle: 0}

	/*
    const editingToolEntity = {
        selectedType: 1,
        focus: {x: 0.0, y: 0.0, z: 0.0},
        mode: "create",
        debounce: 0,
        invertToolDebounce: 0,
        cachedType: 0,
    }
    */

	//const editingBlockRayCast = new CollisionInfo()
	engine.runRenderLoop(() => {
		const deltaTime = engine.getDeltaTime()
		const deltaSeconds = deltaTime * 0.0001
        
		// input updates
		{
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
        
		// process mouse movement (controller adaptor)
		{
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

		// camera rotation & positioning
		{
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
        
		// movement
		{
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

		// check for collisions
		{   
			const {impulse, velocity, kinematics} = playerEntity

			velocity.x += impulse.x / kinematics.mass
			velocity.y += impulse.y / kinematics.mass
			velocity.z += impulse.z / kinematics.mass

			// reset forces for next frame
            
			impulse.x = impulse.y = impulse.z = 0.0

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

			/*
            if (res.touchedX) {
                const stoppingImpulse = kinematics.mass * - velocity.x
                impulse.x += stoppingImpulse
            }
            const {position, collider} = playerEntity
            if (res.touchedY) {
                const stoppingImpulse = kinematics.mass * - velocity.y
                impulse.y += stoppingImpulse
            } else if (!chunkManager.isVoxelSolid(
                Math.floor(position.x), 
                Math.floor(position.y - collider.y - 1.0), 
                Math.floor(position.z)
            )) {
                impulse.y += kinematics.mass * -(GRAVITY * deltaSeconds * kinematics.gravityModifier)
            }

            if (res.touchedZ) {
                const stoppingImpulse = kinematics.mass * - velocity.z
                impulse.z += stoppingImpulse
            }
            */
		}

		// apply transforms
		{
			playerEntity.position.x += playerEntity.transform.x
			playerEntity.position.y += playerEntity.transform.y
			playerEntity.position.z += playerEntity.transform.z
		}

		// apply visual changes
		{
			const playerMesh = activeMeshes[playerEntity.rendering.id]
			playerMesh.position.x = playerEntity.position.x
			playerMesh.position.z = playerEntity.position.z
			playerMesh.position.y = playerEntity.position.y

			// debug
			//boxCollider.position.x = playerEntity.position.x
			//boxCollider.position.y = playerEntity.position.y
			//boxCollider.position.z = playerEntity.position.z
		}

		// update block tool
		/*
        {
            const {x, y, z} = playerEntity.position
            const xbias = 1.5
            const ybias = 0.5

            // camera vertical angle
            //const yspeed = Math.cos(Math.PI - camera.beta)
            const horizontalAngle = Math.cos(Math.PI - camera.alpha)
            const verticalAngle = Math.sin(Math.PI * 2 - camera.alpha)
            
            const {position} = playerEntity
            const res = sweepPoint(
                position,
                {
                    x: horizontalAngle * 10, 
                    y: 0,
                    z: verticalAngle * 10
                },
                chunkManager,
                0.2,
                3,
                editingBlockRayCast
            )

            if (controller.invertTool && Date.now() > editingToolEntity.invertToolDebounce) {
                const deleteMode = editingToolEntity.mode === "create"
                if (deleteMode) {
                    editingToolEntity.mode = "delete"
                    deleteTool.setEnabled(true)
                    editingBlock.setEnabled(false)
                    editingToolEntity.cachedType = editingToolEntity.selectedType
                    editingToolEntity.selectedType = 0
                } else {
                    editingToolEntity.mode = "create"
                    deleteTool.setEnabled(false)
                    editingBlock.setEnabled(true)
                    editingToolEntity.selectedType = editingToolEntity.cachedType
                }

                editingToolEntity.invertToolDebounce = Date.now() + 500
            }

            if (editingToolEntity.mode === "create") {
                editingBlock.position.x = x + xbias
                editingBlock.position.y = y - ybias
                editingBlock.position.z = z
                if (res.collided) {
                    editingBlock.setEnabled(false)
                } else {
                    const {distanceTraveled} = res
                    const x = ~~(position.x + distanceTraveled.x)
                    const y = ~~(position.y + distanceTraveled.y)
                    const z = ~~(position.z + distanceTraveled.z)
                    //console.log("edit", x, y, z)
                    editingBlock.position.set(
                        x + (distanceTraveled.x < 0 && distanceTraveled.x > distanceTraveled.z ? -0.0 : 0.5), 
                        y - 0.5,
                        z + (distanceTraveled.z < 0 && distanceTraveled.z > distanceTraveled.x ? -0.0: 0.5)
                    )
                    editingToolEntity.focus.x = x
                    editingToolEntity.focus.y = y
                    editingToolEntity.focus.z = z
                    editingBlock.setEnabled(true)
                }
                
                const now = Date.now()
                if (
                    controller.interact &&
                    now > editingToolEntity.debounce
                ) {
                    const {focus: {x, y, z}, selectedType} = editingToolEntity
                    chunkManager.mutateVoxel(x, y - 1, z, selectedType)
                    editingToolEntity.debounce = now + 100
                }
            } else if (editingToolEntity.mode === "delete") {
                editingBlock.position.x = x
                editingBlock.position.y = y
                editingBlock.position.z = z
                if (res.collided) {
                    const {distanceTraveled} = res
                    const x = ~~(position.x + distanceTraveled.x)
                    const y = ~~(position.y + distanceTraveled.y)
                    const z = ~~(position.z + distanceTraveled.z)
                    deleteTool.position.set(
                        x - 0.5, 
                        y - 0.5,
                        z - 0.5
                    )
                    editingToolEntity.focus.x = x + 1.5
                    editingToolEntity.focus.y = y - 1
                    editingToolEntity.focus.z = z + 1.5
                    deleteTool.setEnabled(true)
                } else {
                    deleteTool.setEnabled(false)
                }
                
                const now = Date.now()
                if (
                    controller.interact &&
                    now > editingToolEntity.debounce
                ) {
                    const {focus: {x, y, z}, selectedType} = editingToolEntity
                    chunkManager.mutateVoxel(x, y, z, selectedType)
                    editingToolEntity.debounce = now + 100
                }
            }

        }
        */

		/*{
            const {x, z} = player.position
            const {boundaryX, boundaryZ} = lodSystemState
            if (
                x > boundaryX.upper
                || x < boundaryX.lower
                || z > boundaryZ.upper
                || z < boundaryZ.lower
            ) {
                const xDiff = x % minChunkSize
                const xbase = x - xDiff
                lodSystemState.boundaryX.lower = xbase
                lodSystemState.boundaryX.upper = xbase + minChunkSize
                const zDiff = z % minChunkSize
                const zbase = z - zDiff
                lodSystemState.boundaryZ.lower = zbase
                lodSystemState.boundaryZ.upper = zbase + minChunkSize
                chunkManager.diffChunks(x, z)
                console.info("diffed chunks", boundaryX, boundaryZ, x, z)
            }
            chunkManager.execPendingTask()
        }*/

		// some logging stuff
		{
			console.log("terrain chunks", chunkManager.chunkCount())
		}

		// adjust horizon
		{
			skyMaterial.cameraOffset.y = (scene.activeCamera as Camera).globalPosition.y
		}

		{
			scene.render()
		}
	})
}
