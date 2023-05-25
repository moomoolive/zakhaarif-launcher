import type {
	ModMetadata,
	QueryAccessor,
	ModAccessor,
} from "zakhaarif-dev-tools"
import {Null} from "../utils"

export type CompiledModConfig = {
	state: object
	meta: ModMetadata
	resources: Record<string, string>
	queries: Record<string, QueryAccessor>
	archetypes: ReturnType<ModAccessor["useArchetype"]>,
	componentIds: Record<string, number>
}

export class CompiledMod extends Null implements ModAccessor {
	readonly singleton: object
	readonly meta: ModMetadata
	readonly resources: Record<string, string>
	readonly queries: Record<string, QueryAccessor>
	readonly archetypes: ReturnType<ModAccessor["useArchetype"]>
	readonly comps: Record<string, number>

	constructor(config: CompiledModConfig) {
		super()
		this.singleton = config.state
		this.meta = config.meta
		this.resources = config.resources
		this.queries = config.queries
		this.archetypes = config.archetypes
		this.comps = config.componentIds
	}

	mutState() { return this.singleton }
	state() { return this.singleton }
	useArchetype() { return this.archetypes }
}
