type Velocity = { x: number, y: number, z: number }
type Position = { x: number, y: number, z: number }
interface World {
    isVoxelSolid: (x: number, y: number, z: number) => boolean
}

export class Vec3 { x = 0.0; y = 0.0; z = 0.0 }

export class CollisionInfo {
    collided: boolean
    normal: number
    distanceTraveled: Vec3
    distanceLeft: Vec3

    constructor() {
        this.collided = false
        this.normal = 0
        this.distanceTraveled = new Vec3()
        this.distanceLeft = new Vec3()
    }
}

export const enum axis {
    positive_x = 1,
    negative_x = -1,
    x_bit_check = 1 << positive_x,

    positive_y = 2, 
    negative_y = -2,
    y_bit_check = 1 << positive_y,
    
    positive_z = 3,
    negative_z = -3,
    z_bit_check = 1 << positive_z,
}

const hypotenuse3d = (x: number, y: number, z: number) => Math.sqrt(x ** 2 + y ** 2 + z ** 2)

/**
 * Check if point collides with world.
 * Assumes world is divided into unit sized cubes (1 x 1 x 1)
 * and all possible positions are positive. Returns first collision.
 * 
 * @param position 
 * @param velocity 
 * @param world 
 * @param deltaSeconds 
 * @param distanceCap 
 * @returns 
 */

export const sweepPoint = (
    position: Position,
    velocity: Velocity,
    world: World,
    deltaSeconds: number,
    distanceCap: number,
    collisionRef: CollisionInfo
) => {
    // implemenation taken from javidx9: https://www.youtube.com/watch?v=NbSee-XM7WA
    // calculate final position
    const distanceX = velocity.x * deltaSeconds
    const distanceZ = velocity.z * deltaSeconds
    const distanceY = velocity.y * deltaSeconds
    const maxDistance = hypotenuse3d(distanceX, distanceY, distanceZ)
    
    if (maxDistance <= 0.0) {
        return collisionRef
    }

    // accumulated steps across hypotenuse for each axis
    let hypotenuseX = 0.0
    let hypotenuseY = 0.0
    let hypotenuseZ = 0.0

    // current ray position (integer), use math.floor instead of 
    // truncating so that algorithm will work for both negative &
    // positive coordinates
    let currentX = Math.floor(position.x)
    let currentY = Math.floor(position.y)
    let currentZ = Math.floor(position.z)

    // calculate length of each step
    const xStep = Math.abs(maxDistance / distanceX)
    let xSignStep = 0
    if (distanceX < 0) {
        xSignStep = -1
        hypotenuseX = (position.x - currentX) * xStep
    } else {
        xSignStep = 1
        hypotenuseX = (currentX + 1 - position.x) * xStep
    }

    const yStep = Math.abs(maxDistance / distanceY)
    let ySignStep = 0
    if (distanceY < 0) {
        ySignStep = -1
        hypotenuseY = (position.y - currentY) * yStep
    } else {
        ySignStep = 1
        hypotenuseY = (currentY + 1 - position.y) * yStep
    }

    const zStep = Math.abs(maxDistance / distanceZ) 
    let zSignStep = 0
    if (distanceZ < 0) {
        zSignStep = -1
        hypotenuseZ = (position.z - currentZ) * zStep
    } else {
        zSignStep = 1
        hypotenuseZ = (currentZ + 1 - position.z) * zStep
    }

    let accumulatedDistance = 0.0
    const stopDistance = Math.min(maxDistance, distanceCap)
    let currentAxis = axis.positive_x
    while (accumulatedDistance < stopDistance) {
        // set traversal details
        if (hypotenuseX < hypotenuseY && hypotenuseX < hypotenuseZ) {
            currentX += xSignStep
            accumulatedDistance = hypotenuseX
            hypotenuseX += xStep
            currentAxis = axis.positive_x
        } else if (hypotenuseY < hypotenuseX && hypotenuseY < hypotenuseZ) {
            currentY += ySignStep
            accumulatedDistance = hypotenuseY
            hypotenuseY += yStep
            currentAxis = axis.positive_y
        } else {
            currentZ += zSignStep
            accumulatedDistance = hypotenuseZ
            hypotenuseZ += zStep
            currentAxis = axis.positive_z
        }

        if (!world.isVoxelSolid(currentX, currentY, currentZ)) {
            continue
        }
        
        const timeOfCollision = accumulatedDistance / maxDistance
        collisionRef.collided = true
        const traveled = collisionRef.distanceTraveled
        traveled.x = distanceX * timeOfCollision
        traveled.y = distanceY * timeOfCollision
        traveled.z = distanceZ * timeOfCollision
        switch (currentAxis) {
            // negative normal means negative axis
            case axis.positive_x:
                collisionRef.normal = 1 * xSignStep
                break
            case axis.positive_y:
                collisionRef.normal = 2 * ySignStep
                break
            case axis.positive_z:
                collisionRef.normal = 3 * zSignStep
                break
        }
        return collisionRef
    }
    collisionRef.collided = false
    {
        const traveled = collisionRef.distanceTraveled
        traveled.x = distanceX
        traveled.y = distanceY
        traveled.z = distanceZ
    }
    return collisionRef
}

const TRUNCATION_MARGIN_OF_ERROR =  1e-10
const leadEdgeToInt = (lead: number, signStep: number) => Math.floor(lead - signStep * TRUNCATION_MARGIN_OF_ERROR)
const trailEdgeToInt = (trail: number, signStep: number) => Math.floor(trail + signStep * TRUNCATION_MARGIN_OF_ERROR)

type Transform = { x: number, y: number, z: number }
type BoundingBoxDimensions = { x: number, y: number, z: number }

/**
 * Check if bounding box collides with world.
 * Assumes world is divided into unit sized cubes (1 x 1 x 1)
 * and all possible positions are positive. Returns first collision.
 * 
 * @param position 
 * @param velocity 
 * @param world 
 * @param deltaSeconds 
 * @param distanceCap 
 * @returns 
 */
 export const sweepBox = (
    origin: Position,
    transform: Transform,
    boxDimensions: BoundingBoxDimensions,
    world: World,
    collisionRef: CollisionInfo
) => {
    // this implementation is heavily inspired by fenomas: https://github.com/fenomas/voxel-aabb-sweep
    // watch out, as this algorithm can become quite slow for large bounding boxes

    const {x: distanceX, y: distanceY, z: distanceZ} = transform
    const maxDistance = hypotenuse3d(distanceX, distanceY, distanceZ)

    const maxX = origin.x + boxDimensions.x
    const baseX = origin.x - boxDimensions.x
    const maxY = origin.y + boxDimensions.y
    const baseY = origin.y - boxDimensions.y
    const maxZ = origin.z + boxDimensions.z
    const baseZ = origin.z - boxDimensions.z
    
    if (maxDistance <= 0.0) {
        const dist = collisionRef.distanceTraveled
        dist.x = dist.y = dist.z = 0.0
        collisionRef.collided = false
        return collisionRef
    }

    let t = 0.0

    let stepX = 0
    let leadXInt = 0
    let trailX = 0.0
    let trailXInt = 0
    const normX = distanceX / maxDistance
    const tDeltaX = Math.abs(1 / normX)
    let tNextX = 0.0
    if (distanceX < 0) {
        stepX = -1
        const lead = baseX
        leadXInt = leadEdgeToInt(lead, stepX)
        trailX = maxX
        trailXInt = trailEdgeToInt(trailX, stepX)
        tNextX = tDeltaX * (lead - leadXInt) || Infinity
        tNextX = tNextX 
    } else {
        stepX = 1
        const lead = maxX
        leadXInt = leadEdgeToInt(lead, stepX)
        trailX = baseX
        trailXInt = trailEdgeToInt(trailX, stepX)
        tNextX = tDeltaX * (leadXInt + 1 - lead) || Infinity
    }

    let stepY = 0
    let leadYInt = 0
    let trailY = 0.0
    let trailYInt = 0
    const normY = distanceY / maxDistance
    const tDeltaY = Math.abs(1 / normY)
    let tNextY = 0.0
    if (distanceY < 0) {
        stepY = -1
        const lead = baseY
        leadYInt = leadEdgeToInt(lead, stepY)
        trailY = maxY
        trailYInt = trailEdgeToInt(trailY, stepY)
        tNextY = tDeltaY * (lead - leadYInt) || Infinity
    } else {
        stepY = 1
        const lead = maxY
        leadYInt = leadEdgeToInt(lead, stepY)
        trailY = baseY
        trailYInt = trailEdgeToInt(trailY, stepY)
        tNextY = tDeltaY * (leadYInt + 1 - lead) || Infinity
    }

    let stepZ = 0
    let leadZInt = 0
    let trailZ = 0.0
    let trailZInt = 0
    const normZ = distanceZ / maxDistance
    const tDeltaZ = Math.abs(1 / normZ)
    let tNextZ = 0.0
    if (distanceZ < 0) {
        stepZ = -1
        const lead = baseZ
        leadZInt = leadEdgeToInt(lead, stepZ)
        trailZ = maxZ
        trailZInt = trailEdgeToInt(trailZ, stepZ)
        tNextZ = tDeltaZ * (lead - leadZInt) || Infinity
    } else {
        stepZ = 1
        const lead = maxZ
        leadZInt = leadEdgeToInt(lead, stepZ)
        trailZ = baseZ
        trailZInt = trailEdgeToInt(trailZ, stepZ)
        tNextZ = tDeltaZ * (leadZInt + 1 - lead) || Infinity
    }

    let xStart = 0
    let yStart = 0
    let zStart = 0
    let currentAxis = axis.positive_x

    if (tNextX < tNextY && tNextX < tNextZ) {
        const dt = tNextX - t
        t = tNextX
        leadXInt += stepX
        tNextX += tDeltaX

        trailX += dt * normX
        trailXInt = trailEdgeToInt(trailX, stepX)
        trailY += dt * normY
        trailYInt = trailEdgeToInt(trailY, stepY)
        trailZ += dt * normZ
        trailZInt = trailEdgeToInt(trailZ, stepZ)

        currentAxis = axis.positive_x
        xStart = leadXInt
        yStart = trailYInt
        zStart = trailZInt
    } else if (tNextY < tNextZ && tNextY < tNextZ) {
        const dt = tNextY - t
        t = tNextY
        leadYInt += stepY
        tNextY += tDeltaY

        trailX += dt * normX
        trailXInt = trailEdgeToInt(trailX, stepX)
        trailY += dt * normY
        trailYInt = trailEdgeToInt(trailY, stepY)
        trailZ += dt * normZ
        trailZInt = trailEdgeToInt(trailZ, stepZ)

        currentAxis = axis.positive_y
        xStart = trailXInt
        yStart = leadYInt
        zStart = trailZInt
    } else {
        const dt = tNextZ - t
        t = tNextZ
        leadZInt += stepZ
        tNextZ += tDeltaZ

        trailX += dt * normX
        trailXInt = trailEdgeToInt(trailX, stepX)
        trailY += dt * normY
        trailYInt = trailEdgeToInt(trailY, stepY)
        trailZ += dt * normZ
        trailZInt = trailEdgeToInt(trailZ, stepZ)

        currentAxis = axis.positive_z
        xStart = trailXInt
        yStart = trailYInt
        zStart = leadZInt
    }

    while (t <= maxDistance) {
        const xEnd = leadXInt + stepX
        const yEnd = leadYInt + stepY
        const zEnd = leadZInt + stepZ

        for (let x = xStart; x !== xEnd; x += stepX) {
            for (let y = yStart; y !== yEnd; y += stepY) {
                for (let z = zStart; z !== zEnd; z+= stepZ) {
                    if (!world.isVoxelSolid(x, y, z)) {
                        continue
                    }
                    const distanceTraveledRatio = t / maxDistance
                    
                    const traveled = collisionRef.distanceTraveled
                    traveled.x = distanceX * distanceTraveledRatio 
                    traveled.y = distanceY * distanceTraveledRatio
                    traveled.z = distanceZ * distanceTraveledRatio

                    /* margin of error applied to stop the lead 
                    bounding box boundary from overshooting the voxel it
                    has collided into. Without the margin of error many
                    collisions may be missed. */
                    const marginOfError = 1e-5
                    
                    switch (currentAxis) {
                        case axis.positive_x:
                            collisionRef.normal = axis.positive_x * stepX
                            traveled.x -= marginOfError * stepX
                            break
                        case axis.positive_y:
                            collisionRef.normal = axis.positive_y * stepY
                            traveled.y -= marginOfError * stepY
                            break
                        case axis.positive_z:
                            collisionRef.normal = axis.positive_z * stepZ
                            traveled.z -= marginOfError * stepZ
                            break
                    }

                    const left = collisionRef.distanceLeft
                    left.x = distanceX - traveled.x
                    left.y = distanceY - traveled.y
                    left.z = distanceZ - traveled.z
                    
                    collisionRef.collided = true

                    return collisionRef
                }
            }
        }

        if (tNextX < tNextY && tNextX < tNextZ) {
            const dt = tNextX - t
            t = tNextX
            leadXInt += stepX
            tNextX += tDeltaX
    
            trailX += dt * normX
            trailXInt = trailEdgeToInt(trailX, stepX)
            trailY += dt * normY
            trailYInt = trailEdgeToInt(trailY, stepY)
            trailZ += dt * normZ
            trailZInt = trailEdgeToInt(trailZ, stepZ)
    
            currentAxis = axis.positive_x
            xStart = leadXInt
            yStart = trailYInt
            zStart = trailZInt
        } else if (tNextY < tNextZ && tNextY < tNextZ) {
            const dt = tNextY - t
            t = tNextY
            leadYInt += stepY
            tNextY += tDeltaY
    
            trailX += dt * normX
            trailXInt = trailEdgeToInt(trailX, stepX)
            trailY += dt * normY
            trailYInt = trailEdgeToInt(trailY, stepY)
            trailZ += dt * normZ
            trailZInt = trailEdgeToInt(trailZ, stepZ)
    
            currentAxis = axis.positive_y
            xStart = trailXInt
            yStart = leadYInt
            zStart = trailZInt
        } else {
            const dt = tNextZ - t
            t = tNextZ
            leadZInt += stepZ
            tNextZ += tDeltaZ
    
            trailX += dt * normX
            trailXInt = trailEdgeToInt(trailX, stepX)
            trailY += dt * normY
            trailYInt = trailEdgeToInt(trailY, stepY)
            trailZ += dt * normZ
            trailZInt = trailEdgeToInt(trailZ, stepZ)
    
            currentAxis = axis.positive_z
            xStart = trailXInt
            yStart = trailYInt
            zStart = leadZInt
        }
    }
    
    collisionRef.distanceTraveled.x = distanceX
    collisionRef.distanceTraveled.y = distanceY
    collisionRef.distanceTraveled.z = distanceZ
    collisionRef.collided = false
    return collisionRef
}

export class SweepBoxState {
    collider = new Vec3()
    origin = new Vec3()
    transform = new Vec3()
    tmpTransform = new Vec3()
    collided = false
    tmp = new CollisionInfo()
    touchedAxis = 0

    get touchedX() { return this.touchedAxis & axis.x_bit_check }
    get touchedY() { return this.touchedAxis & axis.y_bit_check }
    get touchedZ() { return this.touchedAxis & axis.z_bit_check }
}

const sweepRes = new SweepBoxState()

export const sweepBoxCollisions = (
    colliderOrigin: Position,
    collider: BoundingBoxDimensions,
    world: World,
    transformX: number,
    transformY: number,
    transformZ: number,
) => {
    sweepRes.touchedAxis = 0

    const {origin} = sweepRes
    origin.x = colliderOrigin.x
    origin.y = colliderOrigin.y
    origin.z = colliderOrigin.z

    const transform = sweepRes.tmpTransform
    transform.x = transformX
    transform.y = transformY
    transform.z = transformZ

    const traveled = sweepRes.transform
    traveled.x = traveled.y = traveled.z = 0.0

    const res = sweepRes.tmp
    let collided = false
    while (sweepBox(origin, transform, collider, world, res).collided) {
        collided = true

        traveled.x += res.distanceTraveled.x
        traveled.y += res.distanceTraveled.y
        traveled.z += res.distanceTraveled.z

        origin.x += traveled.x
        origin.y += traveled.y
        origin.z += traveled.z
        
        transform.x = res.distanceLeft.x
        transform.y = res.distanceLeft.y
        transform.z = res.distanceLeft.z

        switch(res.normal) {
            case axis.negative_x:
            case axis.positive_x:
                transform.x = 0.0
                sweepRes.touchedAxis |= 1 << axis.positive_x
                break
            case axis.negative_y:
            case axis.positive_y:
                transform.y = 0.0
                sweepRes.touchedAxis |= 1 << axis.positive_y
                break
            case axis.negative_z:
            case axis.positive_z:
                transform.z = 0.0
                sweepRes.touchedAxis = 1 << axis.positive_z
                break
        }
    }


    traveled.x += res.distanceTraveled.x
    traveled.y += res.distanceTraveled.y
    traveled.z += res.distanceTraveled.z

    sweepRes.collided = collided

    return sweepRes as SweepBoxState
}