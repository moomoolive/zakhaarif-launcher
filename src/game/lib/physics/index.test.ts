import {expect, it, describe} from "vitest"
import {sweepPoint, sweepBox} from "./index"

class World {
    data: {active: boolean}[][][]
    worldSize: number
    
    constructor(
        worldSize: number
    ) {
        const data: typeof this.data = []
        for (let x = 0; x < worldSize; x++) {
            data.push([])
            for (let y = 0; y < worldSize; y++) {
                data[x].push([])
                for (let z = 0; z < worldSize; z++) {
                    data[x][y].push({active: false})
                }
            }
        }
        this.data = data
        this.worldSize = worldSize ** 3
    }

    fill(...points: {x: number, y: number, z: number}[]) {
        for (const {x, y, z} of points) {
            this.data[x][y][z].active = true
        }
        return this
    }

    isVoxelSolid(x: number, y: number, z: number) {
        return this.data[x][y][z]
    }
}

const FRAME = (1_000.0 / 60.0) * 0.001
const DISTANCE_CAP = 1_000.0

const collision = {
    collided: false, 
    position: {x: 0.0, y: 0.0, z: 0.0},
    normal: {x: 0, y: 0, z: 0},
    timeOfCollision: 0.0
}

describe("point raycasting", () => {
    it("returns false when world is empty", () => {
        const w = new World(10)
        const res = sweepPoint(
            {x: 0.0, y: 0.0, z: 0.0},
            {x: 0.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(res.collided).toBe(false)
    })

    it("should return correct coordinates for collision with integer position", () => {
        const w = new World(10).fill({x: 1, y: 0, z: 0})
        const c1 = sweepPoint(
            {x: 0.0, y: 0.0, z: 0.0},
            {x: 200.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c1.collided).toBe(true)
        expect(c1.position).toStrictEqual({x: 1.0, y: 0.0, z: 0.0})
        expect(c1.normal).toStrictEqual({x: 1.0, y: 0.0, z: 0.0})

        const c2 = sweepPoint(
            {x: 2.0, y: 0.0, z: 0.0},
            {x: -200.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c2.collided).toBe(true)
        expect(c2.position).toStrictEqual({x: 2.0, y: 0.0, z: 0.0})
        expect(c2.normal).toStrictEqual({x: -1.0, y: 0.0, z: 0.0})
    })

    it("should return correct coordinates for collision with floating point position", () => {
        const w = new World(10).fill({x: 1, y: 0, z: 0})
        
        const c1 = sweepPoint(
            {x: 0.0, y: 0.5, z: 0.7},
            {x: 200.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c1.collided).toBe(true)
        expect(c1.position).toStrictEqual({x: 1.0, y: 0.5, z: 0.7})
        expect(c1.normal).toStrictEqual({x: 1.0, y: 0.0, z: 0.0})

        const c2 = sweepPoint(
            {x: 2.0, y: 0.5, z: 0.7},
            {x: -200.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c2.collided).toBe(true)
        expect(c2.position).toStrictEqual({x: 2.0, y: 0.5, z: 0.7})
        expect(c2.normal).toStrictEqual({x: -1.0, y: 0.0, z: 0.0})
    })

    it("should return correct coordinates for collision with 2 components to velocity", () => {
        const w = new World(10).fill(
            {x: 1, y: 0, z: 0},
            {x: 0, y: 1, z: 1},
        )
        
        const c1 = sweepPoint(
            {x: 0.0, y: 0.5, z: 1.0},
            {x: 20.0, y: 200.0, z: 0.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c1.collided).toBe(true)
        expect(~~c1.position.y).toStrictEqual(1.0)
        expect(c1.normal).toStrictEqual({x: 0.0, y: 1.0, z: 0.0})
    })

    it("should return correct coordinates for collision multiple voxels away", () => {
        const w = new World(10).fill(
            {x: 5, y: 0, z: 0},
            {x: 0, y: 1, z: 1},
        )
        {
            const c = sweepPoint(
                {x: 0.0, y: 0.5, z: 0.0},
                {x: 400.0, y: 0.0, z: 0.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(c.collided).toBe(true)
            expect(~~c.position.x).toStrictEqual(5.0)
            expect(c.normal).toStrictEqual({x: 1.0, y: 0.0, z: 0.0})
        }

        {
            const c = sweepPoint(
                {x: 8.2, y: 0.5, z: 0.0},
                {x: -200.0, y: 0.0, z: 0.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(c.collided).toBe(true)
            expect(~~c.position.x).toStrictEqual(6.0)
            expect(c.normal).toStrictEqual({x: -1.0, y: 0.0, z: 0.0})
        }

        {
            const c = sweepPoint(
                {x: 8.2, y: 0.5, z: 0.0},
                {x: -200.0, y: 20.0, z: 0.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(c.collided).toBe(true)
            expect(~~c.position.x).toStrictEqual(6.0)
            expect(c.normal).toStrictEqual({x: -1.0, y: 0.0, z: 0.0})
        }
    })

    it("should return correct coordinates for collision with 3 components to velocity", () => {
        const w = new World(10)

        for (let z = 0; z < 9; z++) {
            for (let y = 0; y < 9; y++) {
                w.fill({x: 9, z, y})
            }
        }
        
        const c1 = sweepPoint(
            {x: 0.0, y: 0.5, z: 0.0},
            {x: 1_000.0, y: 40.0, z: 60.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c1.collided).toBe(true)
        expect(~~c1.position.x).toStrictEqual(9.0)

        {
            const c = sweepPoint(
                {x: 5.6, y: 4.5, z: 1.1},
                {x: 500.0, y: 35.2, z: 10.6},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(c.collided).toBe(true)
            expect(~~c.position.x).toStrictEqual(9.0)
            expect(c.normal).toStrictEqual({x: 1.0, y: 0.0, z: 0.0})
        }
    })

    it("should return first collision", () => {
        const w = new World(10)

        for (let z = 0; z < 9; z++) {
            for (let y = 0; y < 9; y++) {
                w.fill({x: 9, z, y})
            }
        }

        w.fill({x: 1, y: 1, z: 1})
        
        const c1 = sweepPoint(
            {x: 0.0, y: 0.5, z: 0.0},
            {x: 100.0, y: 40.0, z: 60.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(c1.collided).toBe(true)
        expect(~~c1.position.x).toStrictEqual(1.0)
    })

    it("should return false if world is too far away from point", () => {
        const w = new World(10).fill({x: 3, y: 0, z: 0})
        {
            const c = sweepPoint(
                {x: 0.0, y: 0.5, z: 0.0},
                {x: 10.0, y: 0.0, z: 0.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(c.collided).toBe(false)
        }
    })

    it("should return false if ray has not collided before distance cap", () => {
        const w = new World(10).fill({x: 3, y: 0, z: 0})
        {
            const c = sweepPoint(
                {x: 0.0, y: 0.5, z: 0.0},
                {x: 1_000.0, y: 0.0, z: 0.0},
                w,
                FRAME,
                1.0,
                collision
            )
            expect(c.collided).toBe(false)
        }
    })

    it("should fail inputted positions are out of bounds", () => {
        const w = new World(10).fill({x: 3, y: 0, z: 0})
        expect(() => sweepPoint(
            {x: -5.0, y: 0.5, z: 0.0},
            {x: 1_000.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            1.0,
            collision
        )).toThrow()

        expect(() => sweepPoint(
            {x: 5.0, y: -10.0, z: 0.0},
            {x: 1_000.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            1.0,
            collision
        )).toThrow()

        expect(() => sweepPoint(
            {x: 5.0, y: 0.5, z: -100.0},
            {x: 1_000.0, y: 0.0, z: 0.0},
            w,
            FRAME,
            1.0,
            collision
        )).toThrow()
    })
    
})

describe("box raycasting", () => {
    it("returns false when world is empty", () => {
        const w = new World(10)
        const res = sweepBox(
            {x: 1.0, y: 1.0, z: 1.0},
            {x: 0.0, y: 0.0, z: 0.0},
            {x: 0.5, y: 0.5, z: 0.5},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )
        expect(res.collided).toBe(false)
    })

    it("returns true when box collides with starting integer position", () => {
        const w = new World(10).fill(
            {x: 2, y: 1, z: 1}
        )
        {
            const res = sweepBox(
                {x: 1.0, y: 1.0, z: 1.0},
                {x: 10.0, y: 0.0, z: 0.0},
                {x: 0.5, y: 0.5, z: 0.5},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: 1, y: 0, z: 0})
            expect(res.position).toStrictEqual({x: 1.5, y: 1.0, z: 1.0})
        }
        {
            const res = sweepBox(
                {x: 4.0, y: 1.0, z: 1.0},
                {x: -10.0, y: 0.0, z: 0.0},
                {x: 0.5, y: 0.5, z: 0.5},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: -1, y: 0, z: 0})
            expect(res.position).toStrictEqual({x: 3.5, y: 1.0, z: 1.0})
        }
    })

    it("returns true when box collides with starting floating position", () => {
        const w = new World(10).fill(
            {x: 2, y: 1, z: 1}
        )
        {
            const res = sweepBox(
                {x: 1.0, y: 1.2, z: 1.4},
                {x: 10.0, y: 0.0, z: 0.0},
                {x: 0.5, y: 0.5, z: 0.5},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: 1, y: 0, z: 0})
            expect(res.position).toStrictEqual({x: 1.5, y: 1.2, z: 1.4})
        }
        {
            const res = sweepBox(
                {x: 4.0, y: 1.2, z: 1.4},
                {x: -10.0, y: 0.0, z: 0.0},
                {x: 0.5, y: 0.5, z: 0.5},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: -1, y: 0, z: 0})
            expect(res.position).toStrictEqual({x: 3.5, y: 1.2, z: 1.4})
        }
    })

    it("returns true when part of box collides", () => {
        const w = new World(10).fill(
            {x: 3, y: 4, z: 4}
        )
        {
            const res = sweepBox(
                {x: 5.0, y: 5.0, z: 5.0},
                {x: -10.0, y: 0.0, z: 0.0},
                {x: 1.0, y: 1.0, z: 1.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: -1, y: 0, z: 0})
            expect(res.position).toStrictEqual({x: 5.0, y: 5.0, z: 5.0})
        }

        {
            const res = sweepBox(
                {x: 1.0, y: 5.0, z: 5.0},
                {x: 10.0, y: 0.0, z: 0.0},
                {x: 1.0, y: 1.0, z: 1.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: 1, y: 0, z: 0})
            expect(res.position).toStrictEqual({x: 2.0, y: 5.0, z: 5.0})
        }
    })

    it("returns true when part of box collides 2 velocity components", () => {
        const w = new World(10).fill(
            {x: 3, y: 4, z: 4}
        )
        {
            const res = sweepBox(
                {x: 5.0, y: 5.0, z: 5.0},
                {x: -10.0, y: 1.0, z: 0.0},
                {x: 1.0, y: 1.0, z: 1.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
            expect(res.normal).toStrictEqual({x: -1, y: 0, z: 0})
            expect(~~res.position.x).toStrictEqual(5)
        }
    })

    it("returns true when part of the box collides world with 3 velocity compoents", () => {
        const w = new World(10)
        for (let z = 0; z < 9; z++) {
            for (let y = 0; y < 9; y++) {
                w.fill({x: 9, z, y})
            }
        }

        {
            const res = sweepBox(
                {x: 4.0, y: 5.0, z: 5.0},
                {x: 200.0, y: 30.0, z: 10.0},
                {x: 1.0, y: 1.0, z: 1.0},
                w,
                FRAME,
                DISTANCE_CAP,
                collision
            )
            expect(res.collided).toBe(true)
        }
    })

    it("should fail if any of the box's points out of world bounds", () => {
        const w = new World(10).fill(
            {x: 3, y: 4, z: 4}
        )
        expect(() => sweepBox(
            {x: -5.0, y: 5.0, z: 5.0},
            {x: -10.0, y: 1.0, z: 0.0},
            {x: 1.0, y: 1.0, z: 1.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )).toThrow()

        expect(() => sweepBox(
            {x: 5.0, y: -5.0, z: 5.0},
            {x: -10.0, y: 1.0, z: 0.0},
            {x: 1.0, y: 1.0, z: 1.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )).toThrow()

        expect(() => sweepBox(
            {x: 5.0, y: 5.0, z: -5.0},
            {x: -10.0, y: 1.0, z: 0.0},
            {x: 1.0, y: 1.0, z: 1.0},
            w,
            FRAME,
            DISTANCE_CAP,
            collision
        )).toThrow()
    })
})