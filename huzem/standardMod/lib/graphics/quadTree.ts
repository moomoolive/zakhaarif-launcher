import {Veci32} from "../dataStructures/vec"

export class Vec2 {
    static default() {
        return new Vec2(0.0, 0.0)
    }

    x: number 
    z: number

    constructor(x: number, z: number) {
        this.x = x
        this.z = z
    }

    distanceTo(comparison: Vec2) {
        const {x: cmpx, z: cmpz} = comparison
        const {x, z} = this
        return Math.sqrt((x - cmpx) ** 2 + (z - cmpz) ** 2)
    }

    clone() {
        return new Vec2(this.x, this.z)
    }

    overwrite(x: number, z: number) {
        this.x = x
        this.z = z
        return this
    }
}

export class Box2 {
    static default() {
        return new Box2(Vec2.default(), Vec2.default())
    }

    min: Vec2
    max: Vec2

    constructor(min: Vec2, max: Vec2) {
        this.min = min
        this.max = max
    }

    center(out: Vec2) {
        const {min, max} = this
        const diffx = (max.x - min.x) / 2
        const diffz = (max.z - min.z) / 2
        out.x = min.x + diffx
        out.z = min.z + diffz
        return out
    }

    size(out: Vec2) {
        const {min, max} = this
        const x = Math.abs(max.x - min.x)
        const z = Math.abs(max.z - min.z)
        out.x = x
        out.z = z
        return out
    }

    overwrite(min: Vec2, max: Vec2) {
        this.min.overwrite(min.x, min.z)
        this.max.overwrite(max.x, max.z)
        return this
    }

    clone() {
        return new Box2(this.min.clone(), this.max.clone())
    }
}

// an alias for node, more descriptive
interface LeafNode extends Node {}

const NO_CHILD = -1
const NODES_PER_CHILD = 4

class Node {
    static default() {
        return new Node(Box2.default())
    }

    bounds: Box2
    children: [number, number, number, number]
    center: Vec2
    size: Vec2

    constructor(bounds: Box2) {
        this.bounds = bounds
        this.children = [
            NO_CHILD, NO_CHILD, NO_CHILD, NO_CHILD
        ]
        this.center = bounds.center(new Vec2(0, 0))
        this.size = bounds.size(new Vec2(0, 0))
    }

    overwrite(
        minX: number,
        minZ: number,
        maxX: number,
        maxZ: number
    ) {
        const b = this.bounds
        b.min.x = minX
        b.min.z = minZ
        b.max.x = maxX
        b.max.z = maxZ
        this.center = b.center(this.center)
        this.size = b.size(this.size)

    }
}

const ROOT_NODE = 0
const MINIMUM_NODES = 1

// implementation heavily inspired by simondev
// https://github.com/simondevyoutube/ProceduralTerrain_Part3
export class Quadtree {
    private minNodeSize: number
    private nodes: Node[]
    private usedNodes: number
    private leafNodes: Veci32
    jobId: number

    constructor({
        min = Vec2.default(),
        max = Vec2.default(),
        minNodeSize = 16
    } = {}) {
        const rootNode = new Node(new Box2(min, max))
        this.nodes = [rootNode]
        this.minNodeSize = minNodeSize
        this.usedNodes = MINIMUM_NODES
        this.leafNodes = new Veci32(80, 15)
        this.jobId = 0
    }

    insert(camera: Vec2) {
        this.usedNodes = MINIMUM_NODES
        this.leafNodes.removeAllElements()
        this.jobId++
        return this.recursivelyInsert(
            this.nodes[ROOT_NODE], 
            ROOT_NODE, 
            camera, 
            this.minNodeSize, 
            1
        )
    }

    private recursivelyInsert(
        child: Node,
        nodeRef: number,
        camera: Vec2, 
        minNodeSize: number,
        depth: number
    ) {
        if (
            child.size.x <= minNodeSize
            || child.center.distanceTo(camera) >= child.size.x
        ) {
            child.children[0] = NO_CHILD
            this.leafNodes.push(nodeRef)
            return
        }
        const children = this.createChildren(child)
        for (let i = 0; i < NODES_PER_CHILD; i++) {
            const childRef = children[i]
            const newChild = this.nodes[childRef]
            this.recursivelyInsert(
                newChild, childRef, camera, minNodeSize, depth + 1
            )
        }
    }

    private createChildren(child: Node) {
        const start = this.usedNodes
        const neededLength = start + NODES_PER_CHILD
        if (neededLength > this.nodes.length) {
            const diff = neededLength - this.nodes.length
            for (let i = 0; i < diff; i++) {
                this.nodes.push(Node.default())
            }
        }
        const midpoint = child.center
        const bottomLeftRef = start + 2
        this.nodes[bottomLeftRef].overwrite(
            child.bounds.min.x, child.bounds.min.z,
            midpoint.x, midpoint.z    
        )
        const bottomRightRef = start + 3
        this.nodes[bottomRightRef].overwrite(
            midpoint.x, child.bounds.min.z,
            child.bounds.max.x, midpoint.z
        )
        const topLeftRef = start + 0
        this.nodes[topLeftRef].overwrite(
            child.bounds.min.x, midpoint.z,
            midpoint.x, child.bounds.max.z
        )
        const topRightRef = start + 1
        this.nodes[topRightRef].overwrite(
            midpoint.x, midpoint.z,
            child.bounds.max.x, child.bounds.max.z
        )
        child.children[0] = topLeftRef
        child.children[1] = topRightRef
        child.children[2] = bottomLeftRef
        child.children[3] = bottomRightRef
        this.usedNodes += NODES_PER_CHILD
        return child.children
    }

    leafCount() {
        return this.leafNodes.length
    }

    leaf(index: number) {
        const ref = this.leafNodes.buffer[index]
        return this.nodes[ref] as Readonly<Node>
    }

    /*
    getChildren() {
        const children: LeafNode[] = []
        this.recursivelyGetLeafNodes(this.nodes[ROOT_NODE], children)
        return children as ReadonlyArray<LeafNode>
    }

    private recursivelyGetLeafNodes(child: Node, output: Node[]) {
        if (
            child.size.x >= this.minNodeSize 
            && child.children[0] === NO_CHILD
        ) {
            output.push(child)
            return
        }
        for (let i = 0; i < child.children.length; i++) {
            const childRef = child.children[i]
            const c = this.nodes[childRef]
            this.recursivelyGetLeafNodes(c, output)
        }
    }
    */
}