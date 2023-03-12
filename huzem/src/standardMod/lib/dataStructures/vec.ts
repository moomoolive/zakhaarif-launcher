export class Veci32 {
	static default() {
		return new Veci32(15, 50)
	}

	buffer: Int32Array
	capacity: number
	length: number
	resizeAmount: number

	constructor(initCapacity: number, resizeAmount: number) {
		this.buffer = new Int32Array(initCapacity)
		this.length = 0
		this.capacity = initCapacity
		this.resizeAmount = resizeAmount
	}

	push(int: number) {
		if (this.capacity > this.length) {
			this.buffer[this.length++] = int
			return
		}
		const capacity = this.capacity + this.resizeAmount
		const newBuffer = new Int32Array(capacity)
		for (let i = 0; i < this.capacity; i++) {
			newBuffer[i] = this.buffer[i]
		}
		this.buffer = newBuffer
		this.buffer[this.length++] = int
		this.capacity = capacity
	}

	removeAllElements() {
		this.length = 0
	}
}