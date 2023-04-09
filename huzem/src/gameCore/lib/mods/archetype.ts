export type ComponentBuffer = {
    ptr: number
    elementSize: number
}

export class Archetype {
	components: number[]
	length: number
	capacity: number
	readonly id: number
	componentBuffers: ComponentBuffer[]

	constructor() {
		this.id = 0
		this.components = []
		this.length = 0
		this.capacity = 0
		this.componentBuffers = []
	}
}