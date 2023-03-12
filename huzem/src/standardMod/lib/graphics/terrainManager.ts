import {Quadtree, Vec2, Box2} from "./quadTree"
import {
	VertexData, Mesh, 
	StandardMaterial, 
	Color3,
	CreateBox,
	Color4,
} from "babylonjs"
import {
	VoxelColliders,
	NULL_PTR
} from "../physics/voxelColliders"
import {RunVec} from "../dataStructures/structView"
import {
	voxel_consts,
	TERRAIN_MAX_X,
	TERRAIN_MAX_Y,
	TERRAIN_MAX_Z,
} from "../terrain/index"

const CHUNK_X_DIMENSION = 64
const CHUNK_Z_DIMENSION = CHUNK_X_DIMENSION
const CHUNK_Y_DIMENSION = TERRAIN_MAX_Y
const CHUNK_Z_LIMITS = [0, CHUNK_Z_DIMENSION - 1] as const
const CHUNK_X_LIMITS = [0, CHUNK_X_DIMENSION - 1] as const

const vertexColors = (
	r: number, 
	g: number, 
	b: number, 
	vertexCount: number,
	colors: number[]
) => {
	for (let i = 0; i < vertexCount; i++) {
		colors.push(r, g, b, 0.0)
	}
	return colors
}

const colorTerrainVoxel = (
	_levelOfDetail: number,
	type: number, 
	vertexCount: number,
	colors: number[],
	_side: 0 | 1 | 2 | 3 | 4 | 5
) => {
	switch(type) {
	case voxel_consts.stone:
		vertexColors(0.55, 0.28, 0.0, vertexCount, colors)
		break
	case voxel_consts.grass:
		vertexColors(0.5, 0.9, 0.5, vertexCount, colors)
		break
	case voxel_consts.snow:
		vertexColors(1.0, 1.0, 1.0, vertexCount, colors)
		break
	case voxel_consts.sand:
	default:
		vertexColors(0.76, 0.69, 0.5, vertexCount, colors)
		break
	}
}

/*
const NO_VERTEX = -1
const ensureVertexExist = (
	vertexMap: number[],
	requiredVertex1: number, 
	requiredVertex2: number, 
	requiredVertex3: number, 
	requiredVertex4: number, 
	vertices: number[],
	potentialVertices: number[],
) => {
	const required = [
		requiredVertex1, 
		requiredVertex2, 
		requiredVertex3,
		requiredVertex4
	]
	for (const requiredVertex of required) {
		if (vertexMap[requiredVertex] === NO_VERTEX) {
			const base = requiredVertex * 3
			const indicesRef = vertices.length / 3
			vertices.push(
				potentialVertices[base],
				potentialVertices[base + 1],
				potentialVertices[base + 2],
			)
			vertexMap[requiredVertex] = indicesRef
		}
	}
}
*/

/*
const culledQuad = (
	indices: number[],
	vertices: number[],
	colors: number[],
	renderNegativeY: boolean,
	renderPositiveY: boolean,
	renderNegativeX: boolean,
	renderPositiveX: boolean,
	renderNegativeZ: boolean,
	renderPositiveZ: boolean,
	xGlobal: number,
	zGlobal: number,
	yGlobal: number,
	voxelType: number,
	levelOfDetail: number,
	skFactor: number
) => {
	if (
		!renderNegativeY 
        && !renderPositiveY
        && !renderNegativeZ 
        && !renderPositiveZ
        && !renderNegativeX 
        && !renderPositiveX
	) {
		return
	}

    // vertexMap reference (pretty fancy eh?)
    //    v5+--------+v7  +y  +z
    //     /|       /|     | /
    //    / |      / |     + -- +x
    // v4+--------+v6|    (reference angle)
    //   |  |     |  |
    //   |v1+-----|--+v3
    //   | /      | /
    //   |/       |/
    // v0+--------+v2 
    
    
	const vertexMap = [
		NO_VERTEX, NO_VERTEX, NO_VERTEX, NO_VERTEX, // bottom vertices
		NO_VERTEX, NO_VERTEX, NO_VERTEX, NO_VERTEX  // top vertices
	]
	const f = skFactor
	const potentialVertices = [
		// bottom vertices
		// [(x0,z0), (x0,z1), (x1,z0), (x1,z1)]
		xGlobal + 0, yGlobal + 0, zGlobal + 0,
		xGlobal + 0, yGlobal + 0, zGlobal + f,
		xGlobal + f, yGlobal + 0, zGlobal + 0,
		xGlobal + f, yGlobal + 0, zGlobal + f,
		// top vertices
		// [(x0,z0), (x0,z1), (x1,z0), (x1,z1)]
		xGlobal + 0, yGlobal + 1, zGlobal + 0,
		xGlobal + 0, yGlobal + 1, zGlobal + f,
		xGlobal + f, yGlobal + 1, zGlobal + 0,
		xGlobal + f, yGlobal + 1, zGlobal + f
	]
	const start = vertices.length / 3

	if (renderNegativeX) {
		ensureVertexExist(
			vertexMap,
			0, 5, 1, 4,
			vertices,
			potentialVertices
		)
		indices.push(
			vertexMap[0], vertexMap[5], vertexMap[1],
			vertexMap[4], vertexMap[5], vertexMap[0],
		)
		//indices.push(
		//    b + 0, b + 5, b + 1,
		//    b + 4, b + 5, b + 0,
		//)
	}
	if (renderPositiveX) {
		ensureVertexExist(
			vertexMap,
			2, 3, 7, 6,
			vertices,
			potentialVertices
		)
		indices.push(
			vertexMap[2], vertexMap[3], vertexMap[7],
			vertexMap[2], vertexMap[7], vertexMap[6],
		)
		//indices.push(
		//    b + 2, b + 3, b + 7,
		//    b + 2, b + 7, b + 6,
		//)
	}

	if (renderNegativeY) {
		ensureVertexExist(
			vertexMap,
			0, 1, 2, 3,
			vertices,
			potentialVertices
		)
		indices.push(
			vertexMap[0], vertexMap[1], vertexMap[2],
			vertexMap[3], vertexMap[2], vertexMap[1],
		)
		//indices.push(
		//    b + 0, b + 1, b + 2,
		//    b + 3, b + 2, b + 1,
		//)
	}

	if (renderPositiveY) {
		ensureVertexExist(
			vertexMap,
			4, 6, 5, 7,
			vertices,
			potentialVertices
		)
		indices.push(
			vertexMap[4], vertexMap[6], vertexMap[5],
			vertexMap[7], vertexMap[5], vertexMap[6],
		)
		//indices.push(
		//    b + 4, b + 6, b + 5,
		//    b + 7, b + 5, b + 6,
		//)
	}

	if (renderNegativeZ) {
		ensureVertexExist(
			vertexMap,
			0, 2, 4, 6,
			vertices,
			potentialVertices
		)
		indices.push(
			vertexMap[0], vertexMap[2], vertexMap[4],
			vertexMap[4], vertexMap[2], vertexMap[6]
		)
		//indices.push(
		//    b + 0, b + 2, b + 4,
		//    b + 4, b + 2, b + 6,
		//)
	}
    
	if (renderPositiveZ) {
		ensureVertexExist(
			vertexMap,
			1, 5, 3, 7,
			vertices,
			potentialVertices
		)
		indices.push(
			vertexMap[1], vertexMap[5], vertexMap[3],
			vertexMap[5], vertexMap[7], vertexMap[3],
		)
		//indices.push(
		//    b + 1, b + 5, b + 3,
		//    b + 5, b + 7, b + 3,
		//)
	}
	const vCount = vertices.length / 3 - start

	switch (levelOfDetail) {
	case 1:
		vertexColors(0.0, 1.0, 0.0, vCount, colors)
		break
	case 2:
		vertexColors(0.0, 0.0, 1.0, vCount, colors)
		break
	case 3:
		vertexColors(1.0, 0.0, 0.0, vCount, colors)
		break
	default: {
		const det = (levelOfDetail * 0.1)
		const bas = 0.2
		const n = det + bas
		vertexColors(n, n, n, vCount, colors)
	}
	}
}*/

const logarithm = (base: number, x: number) => Math.log(x) / Math.log(base)
const baseLod = logarithm(2, CHUNK_X_DIMENSION)

const lod = (size: number) => (logarithm(2, size) - baseLod) + 1
const skipFactor = (levelOfDetail: number) => (2 ** (baseLod + levelOfDetail - 1)) / CHUNK_X_DIMENSION

//const fastIntModulo = (dividend: number, divisor: number) => {
//	return dividend - ~~(dividend / divisor) * divisor
//}

const visitedIndex = (
	x: number, 
	y: number, 
	z: number,
	xstart: number,
	zstart: number,
	lodFactor: number
) => {
	return ((x - xstart) / lodFactor) * CHUNK_Z_DIMENSION * CHUNK_Y_DIMENSION + ((z - zstart) / lodFactor) * CHUNK_Y_DIMENSION + y
}

type AxisIterator = [number, number, number]
const greedyQuadIter = [0, 0, 0] as AxisIterator
const greedyQuadFace = [0, 0, 0] as AxisIterator
const greedyQuadInc = [0, 0, 0] as AxisIterator
//const greedyQuadVisited = [0, 0, 0] as AxisIterator

interface VoxelChecker {
    getVoxel: (x: number, y: number, z: number) => number
}

type AxisRef = 0 | 1 | 2
const greedyQuad = (
	mainAxis: AxisRef,
	mainAxisStart: number,
	mainAxisLimit: number,
	mainLocalCoord: number,
	altAxis: AxisRef,
	altAxisStart: number,
	altAxisLimit: number,
	altlocalCoord: number,
	tertiaryAxis: AxisRef,
	tertiaryAxisStart: number,
	teritaryAxisLimit: number,
	tertiarylocalCoord: number,
	visitedArr: Uint8Array,
	targetType: number,
	positiveAxis: boolean,
	axisFlag: number,
	lodFactor: number,
	vertices: number[],
	voxels: VoxelChecker,
	originx: number,
	originz: number
) => {
	const inc = greedyQuadInc
	inc[0] = lodFactor
	inc[1] = 1
	inc[2] = lodFactor
	const tertiaryInc = inc[tertiaryAxis]
	const mainInc = inc[mainAxis]
	const altInc = inc[altAxis]

	let mainAxisEnd = mainAxisStart + mainInc
	let altAxisEnd = altAxisStart + altInc
	const faceCheckOffset = positiveAxis ? 1 : -1
	const iter = greedyQuadIter
	iter[altAxis] = altAxisStart
	iter[tertiaryAxis] = tertiaryAxisStart
	iter[mainAxis] = mainAxisEnd
	const face = greedyQuadFace
	face[altAxis] = altAxisStart
	face[tertiaryAxis] = (
		tertiaryAxisStart 
        + faceCheckOffset * tertiaryInc
	)
	face[mainAxis] = mainAxisEnd
	while (mainAxisEnd < mainAxisLimit) {
		iter[mainAxis] = mainAxisEnd
		const vIdx = visitedIndex(...iter, originx, originz, lodFactor)
		face[mainAxis] = mainAxisEnd
		const visited = visitedArr[vIdx] & axisFlag
		if (
			visited
            // next voxel_consts is not same type
            //|| vbuf[voxaddr(...iter, vptr)] !== targetType 
            || voxels.getVoxel(...iter) !== targetType 
            // next voxel_consts does not have same exposed face
            //|| !(tertiaryAxisStart > teritaryAxisLimit - 2
            //    ? true
            //    : vbuf[voxaddr(...face, vptr)] === voxel_consts.air)
            || !(tertiaryAxisStart > teritaryAxisLimit - 2 * tertiaryInc ? true : voxels.getVoxel(...face) === voxel_consts.air)
		) {
			break
		}
		visitedArr[vIdx] |= axisFlag
		mainAxisEnd += mainInc
	}

	let loop = true
	while (altAxisEnd < altAxisLimit) {
		const start = mainAxisStart
		const end = mainAxisEnd
		iter[altAxis] = altAxisEnd
		iter[tertiaryAxis] = tertiaryAxisStart
		face[altAxis] = altAxisEnd
		face[tertiaryAxis] = (
			tertiaryAxisStart 
            + faceCheckOffset * tertiaryInc
		)
		for (let main = start; main < end; main += mainInc) {
			iter[mainAxis] = main
			const vIdx = visitedIndex(...iter, originx, originz, lodFactor)
			const visited = visitedArr[vIdx] & axisFlag
			face[mainAxis] = main
			if (
				visited
                // next voxel_consts is same type
                //|| vbuf[voxaddr(...iter, vptr)] !== targetType 
                || voxels.getVoxel(...iter) !== targetType 
                // next voxel_consts has the same exposed face
                //|| !(tertiaryAxisStart > teritaryAxisLimit - 2
                //    ? true
                //    : vbuf[voxaddr(...face, vptr)] === voxel_consts.air)
                || !(tertiaryAxisStart > teritaryAxisLimit - 2 * tertiaryInc ? true : voxels.getVoxel(...face) === voxel_consts.air)
			) {
				loop = false
				break
			}
		}
		if (!loop) {
			break
		}
		iter[altAxis] = altAxisEnd
		iter[tertiaryAxis] = tertiaryAxisStart
		for (let main = start; main < end; main += mainInc) {
			iter[mainAxis] = main
			const vIdx = visitedIndex(...iter, originx, originz, lodFactor)
			visitedArr[vIdx] |= axisFlag
		}
		altAxisEnd += altInc
	}

	const vStart = vertices.length / 3                    
	//const minAlt = altGlobalCoord
	const axisConstant = positiveAxis ? 1 : 0
	//let minTertiary = tertiaryGlobalCoord
	//const minMain = mainGlobalCoord
	//const maxAlt = minAlt + (altAxisEnd - altAxisStart) * lodFactor
	//let maxTertiary = 0
	//let maxMain = minMain
	//if (mainAxis === 1) {
	//    minTertiary += lodFactor * axisConstant
	//    maxMain += (mainAxisEnd - mainAxisStart)
	//} else {
	//    minTertiary += axisConstant
	//    maxMain += (mainAxisEnd - mainAxisStart) * lodFactor
	//}
	//maxTertiary = minTertiary
	const minTertiary = (
		tertiaryAxisStart + axisConstant * tertiaryInc
	)
	const maxTertiary = minTertiary
	iter[altAxis] = altAxisStart
	iter[tertiaryAxis] = minTertiary
	iter[mainAxis] = mainAxisStart
	vertices.push(...iter)
    
	iter[altAxis] = altAxisEnd
	vertices.push(...iter)
    
	iter[altAxis] = altAxisStart
	iter[mainAxis] = mainAxisEnd
	vertices.push(...iter)
    
	iter[altAxis] = altAxisEnd
	iter[tertiaryAxis] = maxTertiary
	vertices.push(...iter)
	return vStart
}

type ColoringFn = (levelOfDetail: number,
    _type: number, 
    vertexCount: number,
    colors: number[],
    side: 0 | 1 | 2 | 3 | 4 | 5
) => void


const lodDebugColors = (
	levelOfDetail: number,
	_type: number, 
	vertexCount: number,
	colors: number[]
) => {
	switch (levelOfDetail) {
	case 1:
		vertexColors(0.0, 1.0, 0.0, vertexCount, colors)
		break
	case 2:
		vertexColors(1.0, 0.0, 1.0, vertexCount, colors)
		break
	case 3:
		vertexColors(1.0, 0.0, 0.0, vertexCount, colors)
		break
	default: {
		const det = (levelOfDetail * 0.1)
		const bas = 0.2
		const n = det + bas
		vertexColors(n, n, n, vertexCount, colors)
	}
	}
}

class VoxelRunIterator {
	runPtr: number
	length: number
	end: number
	type: number
	start: number
	nextRun: number
	runX: number
	runZ: number
	intervals: RunVec
    
	private intervalsEnd: number

	constructor(
		start: number,
		length: number,
		x: number, 
		z: number,
		allIntervals: RunVec
	) {
		this.runPtr = start
		this.length = length
		this.intervalsEnd = start + length
		this.end = 0
		this.intervals = allIntervals
		this.nextRun = 0
		this.runX = x
		this.runZ = z
		this.start = 0
		this.type = voxel_consts.null
	}

	reset(
		start: number,
		length: number,
		x: number, 
		z: number,
		allIntervals: RunVec
	) {
		this.runPtr = start
		this.length = length
		this.intervals = allIntervals
		this.intervalsEnd = start + length
		this.runX = x
		this.runZ = z
		this.start = 0
		this.end = 0
		this.type = voxel_consts.null
		this.nextRun = start
		return this
	}

	hasNext() {
		return this.nextRun < this.intervalsEnd
	}

	iter() {
		if (!this.hasNext()) {
			return false
		}
		this.start = this.end
		//const next = this.viewer.deref(this.runPtr, this.nextRun)
		//const next = this.run[this.nextRun]
		const {type, length} = this.intervals.index(this.nextRun)
		this.type = type
		this.end += length
		this.nextRun++
		return true
	}

	iterTo(y: number) {
		if (y <= this.end) {
			return this.reverseTo(y)
		} else {
			return this.forwardTo(y)
		}
	}

	forwardTo(y: number) {
		while (y > this.end && this.iter()) {} // eslint-disable-line no-empty
		return false
	}

	hasPrevious() {
		return this.nextRun > this.runPtr + 1
	}

	iterRev() {
		if (!this.hasPrevious()) {
			return false
		}
		this.end = this.start
		const {type, length} = this.intervals.index(this.nextRun - 2)
		//const prev = this.viewer.deref(this.runPtr, idx)
		this.type = type
		this.start -= length
		this.nextRun--
		return true
	}

	reverseTo(y: number) {
		while (y > this.end && this.iterRev()) {} // eslint-disable-line no-empty
		return false
	}

	isSolid() {
		return this.type !== voxel_consts.null && this.type !== voxel_consts.air 
	}

	isNull() {
		return this.runPtr === NULL_PTR || this.length < 1
	}

	firstAirVoxel() {
		if (this.isNull()) {
			return CHUNK_Y_DIMENSION
		}
		//const runs = this.run
		const startRun = this.intervals.index(this.runPtr)
		let type = startRun.type
		let start = 0
		let end = startRun.length
		let nextRun = this.runPtr + 1
		const totalRuns = this.intervalsEnd
		while (
			nextRun < totalRuns 
            && type !== voxel_consts.air
		) {
			start = end
			//const next = runs[nextRun]
			//const next = this.viewer.deref(this.runPtr, nextRun)
			const next = this.intervals.index(nextRun++)
			type = next.type
			end += next.length
		}
		return start
	}
}

class VoxelColumnIterator {
	target: VoxelRunIterator
	left: VoxelRunIterator
	right: VoxelRunIterator
	front: VoxelRunIterator
	back: VoxelRunIterator
	currentY: number

	constructor(
		start: number,
		length: number, 
		x: number, 
		z: number,
		intervals: RunVec
	) {
		this.target = new VoxelRunIterator(start, length, x, z, intervals)
		this.left = new VoxelRunIterator(start, length, x, z, intervals)
		this.right = new VoxelRunIterator(start, length, x, z, intervals)
		this.front = new VoxelRunIterator(start, length, x, z, intervals)
		this.back = new VoxelRunIterator(start, length, x, z, intervals)
		this.currentY = 0
	}

	height() {
		const col = this.target
		const start = col.runPtr + col.length - 1
		const end = col.runPtr - 1
		let currentRun = start
		let height = CHUNK_Y_DIMENSION
		let target = col.intervals.index(currentRun)
		while (
			currentRun > end
            && (target = col.intervals.index(currentRun)).type === voxel_consts.air
		) {
			height -= target.length
			//height -= col[currentRun].length
			//target = col.intervals.index(--currentRun)
			currentRun--
		}
		return height + 1
	}

	reset(
		targetX: number,
		targetZ: number,
		targetStart: number,
		targetLength: number,
		leftStart: number,
		leftLength: number,
		rightStart: number,
		rightLength: number,
		backStart: number,
		backLength: number,
		frontStart: number,
		frontLength: number,
		intervals: RunVec
	) {
		this.target.reset(targetStart, targetLength, targetX, targetZ, intervals)
		this.left.reset(leftStart, leftLength, targetX - 1, targetZ, intervals)
		this.right.reset(rightStart, rightLength, targetX + 1, targetZ, intervals)
		this.back.reset(backStart, backLength, targetX, targetZ - 1, intervals)
		this.front.reset(frontStart, frontLength, targetX, targetZ + 1, intervals)
		return this
	}

	currentVoxel() {
		return this.target.type
	}

	iterTo(y: number) {
		this.target.forwardTo(y)
		this.currentY = y
	}

	topVoxel() {
		const y = this.currentY + 1
		if (this.target.end >= y) {
			return this.target.type
		} else if (this.target.hasNext()) {
			return this.target.intervals.index(this.target.nextRun).type
			//return this.target.intervals[this.target.nextRun].type
			//return this.target.viewer.deref(this.target.runPtr, this.target.nextRun).type
			//return this.target.run[this.target.nextRun].type
		} else {
			return voxel_consts.unknown_solid
		}
	}

	bottomVoxel() {
		const y = this.currentY - 1
		if (this.target.start <= y) {
			return this.target.type
		} else if (this.target.hasPrevious()) {
			return this.target.intervals.index(this.target.nextRun - 2).type
			//return this.target.intervals[this.target.nextRun - 2].type
			//return this.target.viewer.deref(this.target.runPtr, this.target.nextRun - 2).type
			//return this.target.run[this.target.nextRun - 2].type
		} else {
			return voxel_consts.air
		} 
	}

	rightVoxel() {
		this.right.forwardTo(this.currentY)
		return this.right.type
	}

	leftVoxel() {
		this.left.forwardTo(this.currentY)
		return this.left.type
	}

	frontVoxel() {
		this.front.forwardTo(this.currentY)
		return this.front.type
	}

	backVoxel() {
		this.back.forwardTo(this.currentY)
		return this.back.type
	}

	firstExposedFace() {
		const left = this.left.firstAirVoxel()
		const right = this.right.firstAirVoxel()
		const front = this.front.firstAirVoxel()
		const back = this.back.firstAirVoxel()
		const target = this.target.firstAirVoxel() - 1
		const lowest = Math.min(left, right, front, back, target)
		return lowest
	}
}

const enum axis_flags {
    positive_z = 1 << 0,
    negative_z = 1 << 1,
    positive_x = 1 << 2,
    negative_x = 1 << 3,
    positive_y = 1 << 4,
    negative_y = 1 << 5,
    all_flags = (
        positive_x
        + negative_x
        + positive_y
        + negative_y
        + positive_z
        + negative_z
    )
}

let wireframeShader: StandardMaterial

const enum meshing {
    greedy = 0
}

type MeshAlgorithm = meshing.greedy

class Chunk {
	center: Vec2
	bounds: Box2
	dimensions: Vec2
	levelOfDetail: number
	key: string
	vertexData: VertexData
	mesh: Mesh
	isRendered: boolean
	meshingDelta: number
	skirtDelta: number
	meshMethod: string
    
	readonly id: string
	readonly colliders: VoxelColliders

	private iter: VoxelRunIterator
	private columnIter: VoxelColumnIterator
	colors: Float32Array
	vertices: Float32Array
	faces: Uint32Array
    
	constructor({
		center,
		bounds,
		dimensions,
		levelOfDetail,
		key,
		id,
		colliders
	}: {
        colliders: VoxelColliders,
        id: string,
        key: string,
        levelOfDetail: number,
        center: Vec2,
        bounds: Box2,
        dimensions: Vec2,
    }) {
		this.id = id
		this.colliders = colliders
		this.vertices = new Float32Array()
		this.faces = new Uint32Array()
		this.colors = new Float32Array()
		this.key = key
		this.center = center
		this.bounds = bounds
		this.dimensions = dimensions
		this.levelOfDetail = Math.max(levelOfDetail, 1)
		this.vertexData = new VertexData()
		this.mesh = new Mesh(id)
		this.isRendered = false
		this.meshingDelta = 0.0
		this.skirtDelta = 0.0
		this.meshMethod = "none"

		const startX = 0
		const startZ = 0
		const startRun = this.colliders.getRun(startX, startZ)
		this.iter = new VoxelRunIterator(
			startRun.start, 
			startRun.length, 
			startX, 
			startZ,
			this.colliders.runs
		)
		this.columnIter = new VoxelColumnIterator(
			startRun.start, 
			startRun.length, 
			startX, 
			startZ, 
			this.colliders.runs
		)
	}

	getRunIterator(x: number, z: number) {
		const run = this.colliders.getRun(x, z)
		return this.iter.reset(
			run.start, run.length, x, z, this.colliders.runs
		)
	}

	getColumnIterator(
		x: number, 
		z: number, 
		localX: number, 
		localZ: number,
		lodFactor: number
	) {
		const {start: targetStart, length: targetLength} = this.colliders.getRun(x, z)
		const {start: leftStart, length: leftLength} = localX < 1 
			? this.colliders.nullRunIndex() 
			: this.colliders.getRun(x - 1 * lodFactor, z)
		const {start: rightStart, length: rightLength} = localX > CHUNK_X_DIMENSION - 2
			? this.colliders.nullRunIndex()
			: this.colliders.getRun(x + 1 * lodFactor, z)
		const {start: backStart, length: backLength} = localZ < 1
			? this.colliders.nullRunIndex()
			: this.colliders.getRun(x, z - 1 * lodFactor)
		const {start: frontStart, length: frontLength} = localZ > CHUNK_Z_DIMENSION - 2
			? this.colliders.nullRunIndex()
			: this.colliders.getRun(x, z + 1 * lodFactor)
		return this.columnIter.reset(
			x, 
			z,
			targetStart, targetLength, 
			leftStart, leftLength, 
			rightStart, rightLength, 
			backStart, backLength, 
			frontStart, frontLength,
			this.colliders.runs
		)
	}

	/*
    heightMapSimulation(heightMap: HeightMap) {
        const start = Date.now()
        this.levelOfDetail = Math.max(this.levelOfDetail, 1)
        const {levelOfDetail} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const divisionFactor = nearestPowerOf2(heightMap.height)
        const div = TERRAIN_MAX_X / divisionFactor
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originx + x * skFactor
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originz + z * skFactor
                const percent = heightMap.getHeight(
                    ~~(xGlobal / div),
                    ~~(zGlobal / div),
                )
                const calcHeight = ~~(percent)
                const greaterThanMin = Math.max(calcHeight, 1)
                const lesserThanMax = Math.min(greaterThanMin, CHUNK_Y_DIMENSION)
                const height = lesserThanMax
                const moisture = noise1(xGlobal, zGlobal)
                //const moisture = moistureNoise(xGlobal, zGlobal)
                const currentRun = this.getRun(x, z) 
                // hard code for now
                const biomeRun = currentRun[0]
                biomeRun.type = biome(height - 1, moisture)
                biomeRun.length = height

                const airRunLength = CHUNK_Y_DIMENSION - height
                const airRun = currentRun[1]
                airRun.type = voxel_consts.air
                airRun.length = airRunLength
            }
        }
        this.simulationDelta = Date.now() - start
        this.mostRecentSimulationRendered = false
    }
    */

	/*
    simulate() {
        const start = Date.now()
        this.levelOfDetail = Math.max(this.levelOfDetail, 1)
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const skFactor = skipFactor(levelOfDetail)
        const prevXRow = []
        for (let i = 0; i < CHUNK_Z_DIMENSION; i++) {
            prevXRow.push(0)
        }
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xAddressOffset = xaddr(ptr, x)
            const xGlobal = originx + x * skFactor
            let prevZHeight = -100
            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const addressComputed = zaddr(z, xAddressOffset)
                const zGlobal = originz + z * skFactor
                const calcHeight = generateHeight(xGlobal, zGlobal)
                const initHeight = Math.max(calcHeight, 1)
                let height = initHeight
                const highestDetail = levelOfDetail < 2
                const prevZDiff = Math.abs(prevZHeight - height)
                if (
                    highestDetail
                    || prevZDiff >= skFactor
                ) {
                    prevZHeight = height
                } else {
                    height = prevZHeight
                }
                const prevXDiff = Math.abs(prevXRow[z] - height)
                if (
                    levelOfDetail > 1
                    && z > 1
                    && prevXDiff < skFactor
                ) {
                    height = prevXRow[z]
                }
                prevXRow[z] = height
                const moisture = moistureNoise(xGlobal, zGlobal)
                const biomeType = biome(height - 1, moisture)
                for (let y = 0; y < height; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = biomeType
                }
                // zero out the rest
                // think of a more efficent way later?
                for (let y = height; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, addressComputed)
                    voxelBuffer[v] = voxel_consts.air
                }
            }
        }
        this.simulationDelta = Date.now() - start
        this.mostRecentSimulationRendered = false
    }
    */

	/*
    culledMesh() {
        const start = Date.now()
        const {levelOfDetail, voxelBuffer} = this
        const originx = this.bounds.min.x
        const originz = this.bounds.min.z
        const ptr = 0
        const indices: number[] = []
        const vertices: number[] = []
        const colors: number[] = []
        const skFactor = skipFactor(levelOfDetail)
        for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
            const xGlobal = originx + x * skFactor
            const xaddress = xaddr(ptr, x)

            for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
                const zGlobal = originz + z * skFactor
                const zaddress = zaddr(z, xaddress)
                
                for (let y = 0; y < CHUNK_Y_DIMENSION; y++) {
                    const v = yaddr(y, zaddress)
                    const type = voxelBuffer[v]
                    if (type === voxel_consts.air) {
                        continue
                    }

                    const renderNegativeY = (
                        y > 0 
                        && voxelBuffer[v - 1] === voxel_consts.air
                    )
                    const renderPositiveY = y > CHUNK_Y_DIMENSION - 2
                        ? true
                        : voxelBuffer[v + 1] === voxel_consts.air

                    const renderNegativeX = x < 1 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal - 1, y, zGlobal)
                        : voxelBuffer[voxaddr(x - 1, y, z, ptr)] === voxel_consts.air
                    const renderPositiveX = x > CHUNK_X_DIMENSION - 2 
                        ? false //!this.globalRef.isVoxelSolid(xGlobal + 1, y, zGlobal)
                        : voxelBuffer[voxaddr(x + 1, y, z, ptr)] === voxel_consts.air

                    const renderNegativeZ = z < 1 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal, y, zGlobal - 1)
                        : voxelBuffer[voxaddr(x, y, z - 1, ptr)] === voxel_consts.air
                    const renderPositiveZ = z > CHUNK_Z_DIMENSION - 2 
                        ? false//!this.globalRef.isVoxelSolid(xGlobal, y, zGlobal + 1)
                        : voxelBuffer[voxaddr(x, y, z + 1, ptr)] === voxel_consts.air
                    
                    culledQuad(
                        indices, vertices, colors,
                        renderNegativeY, renderPositiveY,
                        renderNegativeX, renderPositiveX,
                        renderNegativeZ, renderPositiveZ,
                        xGlobal, zGlobal, y, type,
                        levelOfDetail, skFactor
                    )
                }
            }
        }
        this.vertices = vertices
        this.faces = indices
        this.colors = colors
        this.meshMethod = "culled"
        this.createSkirt()
        this.meshingDelta = Date.now() - start
    }
    */

	greedyMesh({meshColorer}: ChunkRenderingOptions) {
		const start = Date.now()
		const colorFn = meshColorer
		const {levelOfDetail, bounds} = this
		const originx = bounds.min.x
		const originz = bounds.min.z
		const maxX = bounds.max.x
		const maxZ = bounds.max.z
		const indices: number[] = []
		const vertices: number[] = []
		const colors: number[] = []
		const skFactor = skipFactor(levelOfDetail)
		const visitedArray = new Uint8Array(
			CHUNK_Y_DIMENSION 
            * CHUNK_X_DIMENSION
            * CHUNK_Z_DIMENSION
		)
		const colliders = this.colliders
		//let iter = 0
		for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
			const xGlobal = originx + x * skFactor
			for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
				const zGlobal = originz + z * skFactor
				const column = this.getColumnIterator(
					xGlobal, zGlobal, x, z, skFactor
				)
				const start = column.firstExposedFace()
				const height = column.height()
				for (let y = start; y < height; y++) {
					const visitedRef = visitedIndex(
						xGlobal, y, zGlobal,
						originx, originz,
						skFactor
					)
					const visited = visitedArray[visitedRef]
					if (visited === axis_flags.all_flags) {
						continue
					}
					column.iterTo(y)
					const type = column.currentVoxel()
					if (type === voxel_consts.air) {
						visitedArray[visitedRef] = axis_flags.all_flags
						continue
					}

					const positiveYAxisVisited = visited & axis_flags.positive_y
					if (
						!positiveYAxisVisited
                        && column.topVoxel() === voxel_consts.air
					) {
						const vStart = greedyQuad(
							2,
							zGlobal,
							maxZ,//CHUNK_Z_DIMENSION,
							z,
							0,
							xGlobal,
							maxX,//CHUNK_X_DIMENSION,
							z,
							1,
							y,
							CHUNK_Y_DIMENSION,
							y,
							visitedArray,
							type,
							true,
							axis_flags.positive_y,
							skFactor,
							vertices,
							colliders,
							originx,
							originz
						)
						indices.push(
							vStart + 0, vStart + 1, vStart + 2,
							vStart + 3, vStart + 2, vStart + 1, 
						)
						colorFn(levelOfDetail, type, 4, colors, 0)
					}
                    
					const negativeYAxisVisited = visited & axis_flags.negative_y
					if (
						!negativeYAxisVisited
                        && y > 0
                        && column.bottomVoxel() === voxel_consts.air
					) {
						const vStart = greedyQuad(
							2,
							zGlobal,
							maxZ,//CHUNK_Z_DIMENSION,
							z,
							0,
							xGlobal,
							maxX,//CHUNK_X_DIMENSION,
							x,
							1,
							y,
							CHUNK_Y_DIMENSION,
							y,
							visitedArray,
							type,
							false,
							axis_flags.negative_y,
							skFactor,
							vertices,
							colliders,
							originx,
							originz
						)
						indices.push(
							vStart + 0, vStart + 1, vStart + 2,
							vStart + 3, vStart + 2, vStart + 1, 
						)
						colorFn(levelOfDetail, type, 4, colors, 1)
					}

					const positiveXAxisVisited = visited & axis_flags.positive_x
					if (
						!positiveXAxisVisited
                        && x < CHUNK_X_DIMENSION - 1
                        && column.rightVoxel() === voxel_consts.air
					) {
						const vStart = greedyQuad(
							1,
							y,
							CHUNK_Y_DIMENSION,
							y,
							2,
							zGlobal,
							maxZ,//CHUNK_Z_DIMENSION,
							z,
							0,
							xGlobal,
							maxX, //CHUNK_X_DIMENSION,
							x,
							visitedArray,
							type,
							true,
							axis_flags.positive_x,
							skFactor,
							vertices,
							colliders,
							originx,
							originz
						)
						indices.push(
							vStart + 0, vStart + 1, vStart + 2,
							vStart + 3, vStart + 2, vStart + 1, 
						)
						colorFn(levelOfDetail, type, 4, colors, 2)
					}

					const negativeXAxisVisited = visited & axis_flags.negative_x
					if (
						!negativeXAxisVisited
                        && x > 0
                        && column.leftVoxel() === voxel_consts.air
					) {
						const vStart = greedyQuad(
							1,
							y,
							CHUNK_Y_DIMENSION,
							y,
							2,
							zGlobal,
							maxZ,//CHUNK_Z_DIMENSION,
							z,
							0,
							xGlobal,
							maxX, //CHUNK_X_DIMENSION,
							x,
							visitedArray,
							type,
							false,
							axis_flags.negative_x,
							skFactor,
							vertices,
							colliders,
							originx,
							originz
						)
						indices.push(
							vStart + 0, vStart + 2, vStart + 1,
							vStart + 3, vStart + 1, vStart + 2, 
						)
						colorFn(levelOfDetail, type, 4, colors, 3)
					}

					const positiveZAxisVisited = visited & axis_flags.positive_z
					if (
						!positiveZAxisVisited
                        && z < CHUNK_Z_DIMENSION - 1
                        && column.frontVoxel() === voxel_consts.air
					) {
						const vStart = greedyQuad(
							1,
							y,
							CHUNK_Y_DIMENSION,
							y,
							0,
							xGlobal,
							maxX, //CHUNK_X_DIMENSION,
							x,
							2,
							zGlobal,
							maxZ, //CHUNK_Z_DIMENSION,
							z,
							visitedArray,
							type,
							true,
							axis_flags.positive_z,
							skFactor,
							vertices,
							colliders,
							originx,
							originz
						)
						indices.push(
							vStart + 0, vStart + 2, vStart + 1,
							vStart + 3, vStart + 1, vStart + 2, 
						)
						colorFn(levelOfDetail, type, 4, colors, 4)
					}

					const negativeZAxisVisited = visited & axis_flags.negative_z
					if (
						!negativeZAxisVisited
                        && z > 0
                        && column.backVoxel() === voxel_consts.air
					) {
						const vStart = greedyQuad(
							1,
							y,
							CHUNK_Y_DIMENSION,
							y,
							0,
							xGlobal,
							maxX, //CHUNK_X_DIMENSION,
							x,
							2,
							zGlobal,
							maxZ, //CHUNK_Z_DIMENSION,
							z,
							visitedArray,
							type,
							false,
							axis_flags.negative_z,
							skFactor,
							vertices,
							colliders,
							originx,
							originz
						)
						indices.push(
							vStart + 0, vStart + 1, vStart + 2,
							vStart + 3, vStart + 2, vStart + 1, 
						)
						colorFn(levelOfDetail, type, 4, colors, 5)
					}
					//iter++
				}
			}
		}
		this.meshMethod = "greedy"
		this.createSkirt(colorFn, indices, vertices, colors)
		this.faces = new Uint32Array(indices)
		this.vertices = new Float32Array(vertices)
		this.colors = new Float32Array(colors)
		this.meshingDelta = Date.now() - start
	}

	private createSkirt(
		colorFn: ColoringFn,
		indices: number[],
		vertices: number[],
		colors: number[]
	) {
		const start = Date.now()
		const {levelOfDetail} = this
		const originx = this.bounds.min.x
		const originz = this.bounds.min.z
		const skFactor = skipFactor(levelOfDetail)
		for (let x = 0; x < CHUNK_X_DIMENSION; x++) {
			const xGlobal = originx + x * skFactor
			for (const z of CHUNK_Z_LIMITS) {
				const zGlobal = originz + z * skFactor
				const voxels = this.getRunIterator(xGlobal, zGlobal)
				while (voxels.iter()) {
					const {type} = voxels
					if (type === voxel_consts.air) {
						continue
					}
					const positiveAxis = z > 0
					const maxX = xGlobal + skFactor
					const vStart = vertices.length / 3
					const targetZ = positiveAxis 
						? zGlobal + skFactor
						: zGlobal
					const actualMinY = voxels.start
					const actualMaxY = voxels.end + 1
					vertices.push(
						xGlobal, actualMinY, targetZ,
						maxX, actualMinY, targetZ,
						xGlobal, actualMaxY, targetZ,
						maxX, actualMaxY, targetZ,
					)
					if (positiveAxis) {
						indices.push(
							vStart + 0, vStart + 2, vStart + 1,
							vStart + 3, vStart + 1, vStart + 2, 
						)
					} else {
						indices.push(
							vStart + 0, vStart + 1, vStart + 2,
							vStart + 3, vStart + 2, vStart + 1, 
						)
					}
					colorFn(levelOfDetail, type, 4, colors, positiveAxis ? 4 : 5)
				}
			}
		}

		for (const x of CHUNK_X_LIMITS) {
			const xGlobal = originx + x * skFactor
			for (let z = 0; z < CHUNK_Z_DIMENSION; z++) {
				const zGlobal = originz + z * skFactor
				const voxels = this.getRunIterator(xGlobal, zGlobal)
				while (voxels.iter()) {
					const {type} = voxels
					if (type === voxel_consts.air) {
						continue
					}
					const positiveAxis = x > 0
					const maxZ = zGlobal + skFactor
					const vStart = vertices.length / 3
					const targetX = positiveAxis 
						? xGlobal + skFactor
						: xGlobal
					const actualMinY = voxels.start
					const actualMaxY = voxels.end + 1
					vertices.push(
						targetX, actualMinY, zGlobal,
						targetX, actualMinY, maxZ,
						targetX, actualMaxY, zGlobal,
						targetX, actualMaxY, maxZ,
					)
					if (positiveAxis) {
						indices.push(
							vStart + 0, vStart + 1, vStart + 2,
							vStart + 3, vStart + 2, vStart + 1, 
						)
					} else {
						indices.push(
							vStart + 0, vStart + 2, vStart + 1,
							vStart + 3, vStart + 1, vStart + 2, 
						)
					}
					colorFn(levelOfDetail, type, 4, colors, positiveAxis ? 2 : 3)
				}
			}
		}
		this.skirtDelta = Date.now() - start
	}

	buildMesh(algo: MeshAlgorithm, options: ChunkRenderingOptions) {
		switch (algo) {
		case meshing.greedy:
			this.greedyMesh(options)
			break
		default:
			this.greedyMesh(options)
			break
		}
	}

	render({wireframe, logStats}: ChunkRenderingOptions) {
		const {faces, vertices, colors, vertexData: vd, mesh} = this
		vd.indices = faces
		vd.positions = vertices
		if (wireframe) {
			if (!wireframeShader) {
				wireframeShader = new StandardMaterial("wireframe" + Date.now())
				wireframeShader.emissiveColor = Color3.White()
				wireframeShader.wireframe = true
			}
			mesh.material = wireframeShader
		} else {
			vd.colors = colors
		}
		vd.applyToMesh(mesh, true)
		this.mesh.setEnabled(true)
		this.isRendered = true
		if (logStats) {
			console.info(`${this.meshMethod} mesh took`, this.meshingDelta, "ms. vs:", this.vertexCount().toLocaleString("en-us"))
		}
	}

	destroyMesh() {
		this.mesh.dispose()
		this.isRendered = false
	}

	reInitializeMesh() {
		this.mesh = new Mesh(this.id)
	}

	hideMesh() {
		this.isRendered = false
		this.mesh.setEnabled(false)
	}

	vertexCount() {
		return this.vertices.length / 3
	}

	faceCount() {
		return this.faces.length / 3
	}
}

type ChunkRenderingOptions = {
    wireframe: boolean
    logStats: boolean
    meshColorer: ColoringFn
}

const chunkkey = (x: number, z: number, size: number) => `${x}.${z}[${size}]`

const NULL_CHUNK_HANDLE = -1

const average = (nums: number[]) => {
	const count = nums.length
	const sum = nums.reduce((total, n) => total + n , 0)
	return sum / count
}

const roundDecimal = (num: number, decimals: number) => {
	const factor = 10 ** decimals
	return Math.round(num * factor) / factor
}

export class TerrainManager {
	minNodeSize: number
	recycledChunks: number[]
	rebuildChunks: number[]
	chunks: Chunk[]
	renderOptions: ChunkRenderingOptions

	readonly colliders: VoxelColliders
    
	private chunkIndex: Map<string, number>
	private quadTree: Quadtree
	private cameraVec: Vec2
	private terrainSurrounding: Mesh[]
	private waterLayer: Mesh | null

	constructor({colliders}: {
        colliders: VoxelColliders
    }) {
		this.minNodeSize = CHUNK_X_DIMENSION
		this.chunkIndex = new Map()
		this.recycledChunks = []
		this.chunks = []
		this.rebuildChunks = []
		this.colliders = colliders
		this.quadTree = new Quadtree({
			min: new Vec2(0, 0),
			max: new Vec2(TERRAIN_MAX_X, TERRAIN_MAX_Z),
			minNodeSize: CHUNK_X_DIMENSION
		})
		this.cameraVec = Vec2.default()
		this.terrainSurrounding = []
		this.waterLayer = null
		this.renderOptions = {
			wireframe: false, 
			logStats: true,
			meshColorer: colorTerrainVoxel
		}
	}

	applyChunkColorer(type: "normal" | "lod") {
		if (type === "normal") {
			this.renderOptions.meshColorer = colorTerrainVoxel
		} else if (type === "lod") {
			this.renderOptions.meshColorer = lodDebugColors
		}
	}

	private getRecyclableChunk() {
		if (this.recycledChunks.length < 1) {
			return NULL_CHUNK_HANDLE
		}
		return this.recycledChunks.pop() as number
	}

	showTerrainSurrounding() {
		if (this.terrainSurrounding.length > 0) {
			for (let i = 0; i < this.terrainSurrounding.length; i++) {
				this.terrainSurrounding[i].setEnabled(true)
			}
			return true
		}
		const northPlane = CreateBox("northPlane", {
			width: 10_350,
			height: 50,
			depth: 3_000,
			faceColors: [
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
			]
		})
		northPlane.position.set(2_048, -250, 5_800)
    
		const southPlane = CreateBox("southPlane", {
			width: 10_350,
			height: 50,
			depth: 3000,
			faceColors: [
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
			]
		})
		southPlane.position.set(2_048, -250, -1_500)
    
		const westPlane = CreateBox("westPlane", {
			width: 3_000,
			height: 50,
			depth: 4_800,
			faceColors: [
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
			]
		})
		westPlane.position.set(-1_500, -250, 2_048)
    
		const eastPlane = CreateBox("eastPlane", {
			width: 3000,
			height: 50,
			depth: 4_800,
			faceColors: [
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
				new Color4(0.76, 0.69, 0.5, 0.0),
			]
		})
		eastPlane.position.set(5_800, -250, 2_048)

		this.terrainSurrounding.push(
			northPlane, southPlane, eastPlane, westPlane
		)
		return true
	}

	hideTerrainSurrounding() {
		for (let i = 0; i < this.terrainSurrounding.length; i++) {
			this.terrainSurrounding[i].setEnabled(false)
		}
	}

	showWater() {
		// mc sea level is 62
		const waterShader = new StandardMaterial("EditBoxMaterial")
		waterShader.alpha = 0.95
		const waterLayer = CreateBox("waterLayer", {
			width: 10_000, height: 16.75, depth: 10_000,
			updatable: true,
			faceColors: [
				new Color4(68/255, 85/255, 90/255, 1.0),
				new Color4(68/255, 85/255, 90/255, 1.0),
				new Color4(68/255, 85/255, 90/255, 1.0),
				new Color4(68/255, 85/255, 90/255, 1.0),
				new Color4(68/255, 85/255, 90/255, 1.0),
				new Color4(68/255, 85/255, 90/255, 1.0),
			]
		})
		waterLayer.position.set(2_048.0, 18.0, 2_048.0)
		waterLayer.material = waterShader
		waterLayer.setEnabled(true)
		this.waterLayer = waterLayer
	}

	hideWater() {
		if (this.waterLayer) {
			this.waterLayer.setEnabled(false)
		}
	}

	diffChunks(cameraX: number, cameraZ: number) {
		const quadTree = this.quadTree
		const camera = this.cameraVec.overwrite(cameraX, cameraZ)
		quadTree.insert(camera)
		const leafCount = quadTree.leafCount()

		const newIndex = new Map()
		for (let i = 0; i < leafCount; i++) {
			const {center, size} = quadTree.leaf(i)
			const key = chunkkey(center.x, center.z, size.x)
			newIndex.set(key, NULL_CHUNK_HANDLE)
		}

		const oldIndex = this.chunkIndex
		//let chunksRecycled = 0
		for (const [oldKey, ref] of oldIndex.entries()) {
			if (!newIndex.has(oldKey)) {
				this.recycledChunks.push(ref)
				//chunksRecycled++
			} else {
				newIndex.set(oldKey, ref)
			}
		}

		let chunkref = 0
		//let chunksReused = 0
		for (let i = 0; i < leafCount; i++) {
			const {center, bounds, size} = quadTree.leaf(i)
			const key = chunkkey(center.x, center.z, size.x)
			if (oldIndex.has(key)) {
				continue
			}
			chunkref = this.getRecyclableChunk()
			if (chunkref !== NULL_CHUNK_HANDLE) {
				const chunk = this.chunks[chunkref]
				chunk.key = key
				chunk.bounds.overwrite(bounds.min, bounds.max)
				chunk.center.overwrite(center.x, center.z) 
				chunk.dimensions.overwrite(size.x, size.z)
				chunk.levelOfDetail = lod(size.x)
				//chunksReused++
			} else {
				chunkref = this.chunks.length
				const chunk = new Chunk({
					center: center.clone(), 
					bounds: bounds.clone(), 
					dimensions: size.clone(),
					levelOfDetail: lod(size.x),
					colliders: this.colliders,
					key, 
					id: "terrain-chunk-" + chunkref.toString()
				})
				this.chunks.push(chunk)
			}
			newIndex.set(key, chunkref)
			this.rebuildChunks.push(chunkref)
		}

		for (let i = 0; i < this.recycledChunks.length; i++) {
			const chunkref = this.recycledChunks[i]
			const chunk = this.chunks[chunkref]
			if (chunk.isRendered) {
				chunk.hideMesh()
			}
		} 
		this.chunkIndex = newIndex
	}

	hasTasks() {
		return this.rebuildChunks.length > 0
	}

	rebuildAllActiveChunks() {
		for (let i = 0; i < this.chunks.length; i++) {
			const chunk = this.chunks[i]
			if (!chunk.isRendered) {
				continue
			}

		}
	}

	execPendingTask() {
		if (this.rebuildChunks.length < 1) {
			return false
		}

		for (let i = 0; i < this.rebuildChunks.length; i++) {
			const chunkref = this.rebuildChunks[i]
			const chunk = this.chunks[chunkref]
			chunk.buildMesh(meshing.greedy, this.renderOptions)
			chunk.render(this.renderOptions)
		}
		this.rebuildChunks = []
		return true
	}

	vertexCount() {
		return this.chunks.reduce((total, c) => {
			const count = c.isRendered ? c.vertexCount() : 0
			return total + count
		}, 0)
	}

	faceCount() {
		return this.chunks.reduce((total, c) => {
			const count = c.isRendered ? c.faceCount() : 0
			return total + count
		}, 0)
	}

	averageMeshTime(decimals = 2) {
		const mesh = this.chunks.map(({meshingDelta}) => meshingDelta)
		return roundDecimal(average(mesh), decimals)
	}

	averageSkirtTime(decimals = 2) {
		const mesh = this.chunks.map(({skirtDelta}) => skirtDelta)
		return roundDecimal(average(mesh), decimals)
	}

	chunkCount() {
		return this.quadTree.leafCount()
	}
}
