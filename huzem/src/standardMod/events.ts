import type {ModMetadata, InitializedEngineCore} from "zakhaarif-dev-tools"
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
} from "babylonjs"
import "babylonjs-loaders" // for gltf loader
import {SkyMaterial} from "babylonjs-materials"
import {
	HeightMap, 
	biome,
	TERRAIN_MAX_X,
	TERRAIN_MAX_Y,
	TERRAIN_MAX_Z
} from "./lib/terrain/index"
import {VoxelColliders} from "./lib/physics/voxelColliders"
import {TerrainManager} from "./lib/graphics/terrainManager"
import {createAxisRotation} from "./lib/math/index"

export const stateHandler = async (
	meta: ModMetadata, 
	engine: InitializedEngineCore
) => {
    
	const canvas = engine.getRootCanvas()
	const babylonJsEngine = new Engine(canvas, true, {
		adaptToDeviceRatio: true,
		powerPreference: "high-performance"
	})
	babylonJsEngine.enableOfflineSupport = false
	babylonJsEngine.disableManifestCheck = true
	Database.IDBStorageEnabled = false

	const scene = new Scene(babylonJsEngine, {})

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

	const sun = new DirectionalLight(
		"sun", new Vector3(0.2, -1.0, 0.0), scene
	)
	sun.intensity = 1.0
    
	const {resolvedUrl} = meta
	const heightMapUrl = new URL(
		"/large-assets/misc/terrain-16bit.json", resolvedUrl
	)

	const playerMeshResponse = await SceneLoader.ImportMeshAsync(
		null,
		heightMapUrl.origin + "/large-assets/misc/bfdi-nine/source/",
		"model.gltf",
		scene
	)
	const player = playerMeshResponse.meshes[0] as Mesh
	player.position.y -= 1.0
	{
		(player.rotationQuaternion as Quaternion).multiplyInPlace(
			createAxisRotation(0.0, 1.0, 0.0, Math.PI)
		)
	}
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

	console.info("root url created", heightMapUrl)

	const heightMapResponse = await fetch(heightMapUrl, {method: "GET"})
	const rawHeightMap = await heightMapResponse.json() as {
        height: number
        width: number
        high: number
        data: number[]
    }
	const heightMap = new HeightMap(rawHeightMap)
	console.info(`imported height map (${heightMap.height},${heightMap.width}), with ${heightMap.uniqueDataPoints()} data points`)
	console.info("chunking starting...")
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


	return {
		activeMeshes,
		playerEntity,
		playerStats: {
			rotation: 0
		},
		babylonJsEngine,
		scene,
		camera,
		skyMaterial,
		skybox,
		sun,
		controller: {
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
		},
		mouseMovement: {
			deltaDegreesX: 0.0,
			deltaDegreesY: 0.0,
			currentXDegrees: 0.0,
			currentYDegrees: 0.0,
		},
		lodSystemState: {
			boundaryX: {
				upper: 0,
				lower: 0
			},
			boundaryZ: {
				upper: 0,
				lower: 0
			}
		},
		movementVec: {
			horizontal: 0, 
			vertical: 0, 
			angle: 0
		},
		colliders,
		chunkManager
	}
}