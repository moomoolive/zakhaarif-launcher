const enum ri_encoding {
    start_offset = 0,
    length_offset = 1,
    sizeof = 2
}

export class RunIndexVec {
	static readonly sizeof = ri_encoding.sizeof
	static readonly layout = {start: 0, length: 1} as const

	private array: Int32Array
	private idx: number

	constructor(numberOfElement: number) {
		this.array = new Int32Array(numberOfElement * ri_encoding.sizeof)
		this.idx = 0
	}

	index(i: number) {
		this.idx = i * ri_encoding.sizeof
		return this as {start: number, length: number}
	}

	get start() {
		return this.array[this.idx + ri_encoding.start_offset]
	}

	set start(val: number) {
		this.array[this.idx + ri_encoding.start_offset] = val
	}

	get length() {
		return this.array[this.idx + ri_encoding.length_offset]
	}

	set length(val: number) {
		this.array[this.idx + ri_encoding.length_offset] = val
	}

	len() {
		return this.array.length / ri_encoding.sizeof
	}

	last() {
		return this.index(this.len() - 1)
	}
}

const enum rv_encoding {
    type_offset = 0,
    length_offset = 1,
    sizeof = 2
}

export class RunVec {
	static readonly sizeof = rv_encoding.sizeof
	static readonly layout = {type: 0, length: 1} as const

	private array: Uint16Array
	private idx: number

	constructor(numberOfElements: number) {
		this.array = new Uint16Array(numberOfElements * rv_encoding.sizeof)
		this.idx = 0
	}

	index(i: number) {
		this.idx = i * rv_encoding.sizeof
		return this as {type: number, length: number}
	}

	get type() {
		return this.array[this.idx + rv_encoding.type_offset]
	}

	set type(val: number) {
		this.array[this.idx + rv_encoding.type_offset] = val
	}

	get length() {
		return this.array[this.idx + rv_encoding.length_offset]
	}

	set length(val: number) {
		this.array[this.idx + rv_encoding.length_offset] = val
	}

	len() {
		return this.array.length / rv_encoding.sizeof
	}
}