import type {
	ComponentAccessor, 
	MutableComponentAccessor
} from "zakhaarif-dev-tools"

export type MutableComponentRegistry = {
	readonly [key: string]: MutableComponentAccessor
}

export type ComponentRegistry = {
	readonly [key: string]: ComponentAccessor
}

export type ComponentFieldBuffer = {
    // pointer for jsBuffer type (elementSize = 0)
	// will point into JsObjectHeap
	// otherwise it will point into wasmHeap
	ptr: number
	// should be in ascending order
	// so binary search can be used for lookup
	readonly id: number

	// concatenated into meta field
    /** size of an element in buffer */
	// js field size will be 0 (unsized)
	// otherwise size must be bigger than >= 32 bytes
	readonly elementSize: number
	readonly isJsBuffer: boolean
	// concat end
}

export type ComponentBuffer = {
	bufferPtrs: ReadonlyArray<ComponentFieldBuffer>,
	readonly fieldCount: number
}

// Sander Mertens's amazing post helped inform
// the layout for archetypes.
// link: https://ajmmertens.medium.com/building-an-ecs-2-archetypes-and-vectorization-fe21690805f9
export class Archetype {
	readonly id: number
	/** the amount of memory a single entity consumes */
	readonly sizeOfEntity: number
	/** the number of entities currently being held in archetype */
	entityCount: number
	/** the number of entities that can be held before component buffers need to be resized */
	entityCapacity: number

	// should be in ascending order
	// so binary search can be used for lookup
	componentIds: number[]
	/** the number of components that archetype is comprised of */
	componentCount: number
	// component buffers position should correspond
	// to it's id in above array.
	// example: If component 3 is at position 2,
	// it's respective buffer should be
	// at position 2.
	componentBuffers: ComponentBuffer[]
	
	// accessors & heaps for js
	readonly mutComponents: MutableComponentRegistry
	readonly components: ComponentRegistry

	constructor() {
		this.id = 0
		this.sizeOfEntity = 0
		this.entityCount = 0
		this.entityCapacity = 0
		this.componentIds = []
		this.componentCount = 0
		this.componentBuffers = []

		this.mutComponents = {}
		this.components = {}
	}
}