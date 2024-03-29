import type {ModAccessor} from "zakhaarif-dev-tools"
import {not_implemented} from "../utils"

export type ComponentBuffer = {
	// pointer for jsBuffer type (elementSize = 0)
	// will point into JsObjectHeap
	// otherwise it will point into wasmHeap
	bufferPtrs: Uint32Array,
	meta: ReadonlyArray<{
		// concatenated into meta field
		// js field size will be 0 (unsized)
		// otherwise size must be bigger than >= 32 bytes
		/** size of an element in buffer */
		readonly elementSize: number
	}>
}

type ArchetypeAccessor = ModAccessor["archs"][string]

// Sander Mertens's amazing post helped inform
// the layout for archetypes.
// link: https://ajmmertens.medium.com/building-an-ecs-2-archetypes-and-vectorization-fe21690805f9
export class Archetype implements ArchetypeAccessor {
	id = 0
	modId = 0
	name = ""
	entityBytes = 0
	numberOfEntities = 0
	capacityForEntities = 0
	// should be in ascending order
	// so binary search can be used for lookup
	componentIds = <number[]>[]
	// component buffers position should correspond
	// to it's id in above array.
	// example: If component 3 is at position 2,
	// it's respective buffer should be
	// at position 2.
	componentBuffers = <ComponentBuffer[]>[]
	templatesPtr = 0

	sizeOfEntity(): number {
		return this.entityBytes
	}

	entityCount(): number {
		return this.numberOfEntities
	}

	entityCapacity(): number {
		return this.capacityForEntities
	}

	componentCount(): number {
		return this.componentIds.length
	}

	getComponentOffset(_componentId: number): number {
		return not_implemented()
	}
}

