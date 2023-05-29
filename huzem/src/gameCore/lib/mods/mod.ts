import type {
	ModMetadata,
	QueryAccessor,
	ModAccessor,
} from "zakhaarif-dev-tools"
import {Null} from "../utils"

export type CompiledModConfig = {
	id: number
	name: string
	version: string
	state: object
	meta: ModMetadata
	queries: Record<string, QueryAccessor>
	archetypes: ModAccessor["archs"],
	componentIds: Record<string, number>
}

export class Mod extends Null implements ModAccessor {
	readonly id: number
	readonly name: string
	readonly version: string
	readonly singleton: object
	readonly meta: ModMetadata
	readonly queries: Record<string, QueryAccessor>
	readonly archs: ModAccessor["archs"]
	readonly comps: Record<string, number>

	constructor(config: CompiledModConfig) {
		super()
		this.id = config.id
		this.name = config.name
		this.version = config.version
		this.singleton = config.state
		this.meta = config.meta
		this.queries = config.queries
		this.archs = config.archetypes
		this.comps = config.componentIds
	}

	mutState() { return this.singleton }
	state() { return this.singleton }
}
