import type {
	ModMetadata,
	QueryAccessor,
	ModAccessor,
} from "zakhaarif-dev-tools"
import {Null} from "../utils"

export type CompiledModConfig = {
	state: object
	meta: ModMetadata
	queries: Record<string, QueryAccessor>
	archetypes: ModAccessor["archs"],
	componentIds: Record<string, number>
}

export class CompiledMod extends Null implements ModAccessor {
	readonly singleton: object
	readonly meta: ModMetadata
	readonly queries: Record<string, QueryAccessor>
	readonly archs: ModAccessor["archs"]
	readonly comps: Record<string, number>

	constructor(config: CompiledModConfig) {
		super()
		this.singleton = config.state
		this.meta = config.meta
		this.queries = config.queries
		this.archs = config.archetypes
		this.comps = config.componentIds
	}

	mutState() { return this.singleton }
	state() { return this.singleton }
}
