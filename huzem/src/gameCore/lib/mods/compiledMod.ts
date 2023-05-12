import type {
	ModMetadata,
	QueryAccessor,
	ModAccessor,
} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"

export type CompiledModConfig = {
	state: object
	meta: ModMetadata
	resources: Record<string, string>
	queries: Record<string, QueryAccessor>
	archetypes: ReturnType<ModAccessor["useArchetype"]>,
	componentIds: Record<string, number>
}

export class CompiledMod extends NullPrototype implements ModAccessor {
	readonly state: object
	readonly meta: ModMetadata
	readonly resources: Record<string, string>
	readonly queries: Record<string, QueryAccessor>
	readonly archetypes: ReturnType<ModAccessor["useArchetype"]>
	readonly comps: Record<string, number>

	constructor(config: CompiledModConfig) {
		super()
		this.state = config.state
		this.meta = config.meta
		this.resources = config.resources
		this.queries = config.queries
		this.archetypes = config.archetypes
		this.comps = config.componentIds
	}

	useMutState() {
		return this.state
	}

	useState() {
		return this.state
	}

	useQuery() {
		return this.queries
	}

	useResource() {
		return this.resources
	}

	useArchetype() {
		return this.archetypes
	}
}
