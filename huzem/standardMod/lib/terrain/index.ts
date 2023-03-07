import {moistureNoise} from "./noise"

export const enum voxel_consts {
    null = -1,
    air = 0,
    stone = 1,
    grass = 2,
    dirt = 3,
    water = 4,
    sand = 5,
    snow = 6,
    unknown_solid = 7,
}

export const TERRAIN_MAX_X = 4_096
export const TERRAIN_MAX_Z = TERRAIN_MAX_X
export const TERRAIN_MAX_Y = 1_024
export const OCEAN_LEVEL = 61

export class HeightMap {
    height: number
    width: number
    data: number[]
    high: number
    
    constructor({
        height, width, high, data
    }: {
        height: number,
        width: number,
        high: number,
        data: number[],
    }) {
        this.height = height
        this.width = width
        this.data = data
        this.high = high
    }

    getHeight(x: number, y: number) {
        return this.data[this.height * y + x]
    }

    getHeightPercent(x: number, y: number) {
        return this.getHeight(x, y) / this.high
    }

    uniqueDataPoints() {
        return this.height * this.width
    }

    toJSON() {
        const {height, high, width} = this
        const uniqueDataPoints = this.uniqueDataPoints()
        return JSON.stringify({height, high, width, uniqueDataPoints})
    }
}

const beachLevel = OCEAN_LEVEL + 4
const snowLevel = ~~(TERRAIN_MAX_Y * 0.5)
const mountainLevel = ~~(TERRAIN_MAX_Y * 0.25)

export const biome = (x: number, z: number, elevation: number) => {
    const moisture = moistureNoise(x, z)
    if (elevation < beachLevel) {
        return voxel_consts.sand
    } else if (elevation > snowLevel) {
        if ((moisture * elevation) ** 2.5 > 40) {
            return voxel_consts.snow
        } else {
            return voxel_consts.stone
        }
    } else if (elevation > mountainLevel) {
        if (moisture < 0.1) {
            return voxel_consts.stone
        } else {
            return voxel_consts.stone
        }
    } else {
        return voxel_consts.sand
    }
}