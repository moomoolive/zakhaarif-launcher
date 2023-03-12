import {HeightMap, voxel_consts} from "../terrain/index"
import {RunIndexVec, RunVec} from "../dataStructures/structView"

const nearestPowerOf2 = (num: number) => 1 << 31 - Math.clz32(num)
const toInt = (num: number) => ~~num

const NULL_LENGTH = -1
export const NULL_PTR = -1

export class VoxelColliders {
	static fromHeightMap(
		map: HeightMap, 
		maxHeight: number,
		maxWidth: number,
		maxDepth: number,
		biomeCalculator: (x: number, z: number, height: number) => number
	) {

		const runCount = maxWidth * maxDepth
		const runPtrs = new RunIndexVec(runCount + 1)
		const lastPtr = runPtrs.last()
		lastPtr.start = NULL_PTR
		lastPtr.length = NULL_LENGTH
		const runs = new RunVec(runCount * 2)
		const divisionFactor = nearestPowerOf2(map.height)
		const div = maxWidth / divisionFactor
		for (let z = 0; z < maxDepth; z++) {
			for (let x = 0; x < maxWidth; x++) {
				const index = z * maxDepth + x
				const firstRun = index * 2
                
				const runIndex = runPtrs.index(index)
				runIndex.start = firstRun
				runIndex.length = 2
                
				const totalHeight = map.getHeight(
					toInt(x / div), toInt(z / div)
				)
				const lesserThanMax = Math.min(maxHeight - 1, totalHeight)
				const greaterThanMin = Math.max(1, lesserThanMax)
				const height = greaterThanMin
				const biome = biomeCalculator(x, z, height - 1)
                
				const biomeRun = runs.index(firstRun)
				biomeRun.type = biome
				biomeRun.length = height

				const airRun = runs.index(firstRun + 1)
				airRun.type = voxel_consts.air
				airRun.length = maxHeight - height
			}
		}
		return new VoxelColliders(
			runPtrs,
			runs,
			maxWidth,
			maxHeight,
			maxDepth,
			{
				sourceDebug: map.toJSON(),
				source: "height_map",
			}
		)
	}

	private runPtrs: RunIndexVec
	readonly runs: RunVec
	readonly worldWidth: number
	readonly worldHeight: number
	readonly worldDepth: number
	readonly source: string
	readonly sourceDebug: string

	constructor(
		runPtrs: RunIndexVec, 
		runs: RunVec,
		width: number,
		height: number,
		depth: number,
		{
			sourceDebug = "",
			source = ""
		} = {}
	) {
		this.runPtrs = runPtrs
		this.runs = runs
		this.worldWidth = width
		this.worldHeight = height
		this.worldDepth = depth
		this.source = source
		this.sourceDebug = sourceDebug
	}

	getRun(x: number, z: number) {
		const ptrIndex = z * this.worldDepth + x
		return this.runPtrs.index(ptrIndex)
	}

	getVoxel(x: number, y: number, z: number) {
		const {start, length} = this.getRun(x, z)
		const totalRuns = start + length
		let currentRun = start
		let type = 0
		let end = 0
		while (currentRun < totalRuns && end < y) {
			const next = this.runs.index(currentRun++)
			type = next.type
			end += next.length
		}
		return type
	}

	private columnLastSolidVoxel(x: number, z: number) {
		const {start, length: totalRuns} = this.getRun(x, z)
		const lastIndex = start + totalRuns - 1
		const end = start - 1
		let currentRun = lastIndex
		let height = this.worldHeight
		let target = this.runs.index(currentRun)
		while (
			currentRun > end
            && target.type === voxel_consts.air
		) {
			height -= target.length
			target = this.runs.index(currentRun--)
		}
		return height
	}

	getColumnHeight(x: number, z: number) {
		return this.columnLastSolidVoxel(x, z) + 1
	}

	nullRunIndex() {
		return this.runPtrs.last()
	}
}