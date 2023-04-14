import type {
	ModMetadata,
	QueryAccessor,
	ModAccessor,
	ComponentClass,
	ModArchetypes
} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"

export type CompiledModConfig = {
	state: object
	meta: ModMetadata
	resources: Record<string, string>
	queries: Record<string, QueryAccessor>
	componentClasses: Record<string, ComponentClass>
	archetypes: ModArchetypes
}

export class CompiledMod extends NullPrototype implements ModAccessor {
	readonly state: object
	readonly meta: ModMetadata
	readonly resources: Record<string, string>
	readonly queries: Record<string, QueryAccessor>
	readonly componentClasses: Record<string, ComponentClass>
	readonly archetypes: ModArchetypes

	constructor(config: CompiledModConfig) {
		super()
		this.state = config.state
		this.meta = config.meta
		this.resources = config.resources
		this.queries = config.queries
		this.componentClasses = config.componentClasses
		this.archetypes = config.archetypes
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

	useMetadata() {
		return this.meta
	}

	useResource() {
		return this.resources
	}

	useComponent() {
		return this.componentClasses
	}

	useArchetype() {
		return this.archetypes
	}
}
