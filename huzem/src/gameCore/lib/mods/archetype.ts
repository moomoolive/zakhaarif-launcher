export type ComponentFieldBuffer = {
    ptr: number
    elementSize: number
}

export type ComponentBuffer = Array<ComponentFieldBuffer>

export class Archetype {
	readonly id: number

	components: number[]
	length: number
	capacity: number
	componentBuffers: ComponentBuffer[]

	constructor() {
		this.id = 0
		this.components = []
		this.length = 0
		this.capacity = 0
		this.componentBuffers = []
	}
}