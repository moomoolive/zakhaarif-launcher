import type {
	ModAccessor,
	QueryDescriptor
} from "zakhaarif-dev-tools"
import {Null} from "../utils"

type QueryAccessor = ModAccessor["queries"][string]

export class Query extends Null implements QueryAccessor {
	id = 0
	value = <QueryDescriptor[]>[]
	done = true
	modId = 0
	name = ""

	iteratorComponents = <number[]>[]

	requiredComps = <number[]>[]
	optionalComps = <number[]>[]
	withoutComps = <number[]>[]
	archetypes = <number[]>[]

	next() {
		return this
	}

	[Symbol.iterator]() {
		return this
	}

	iter() {
		return this
	}
}