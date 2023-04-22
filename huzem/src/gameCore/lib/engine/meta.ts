import type {
	MetaUtilities,
	ComponentClass,
	ComponentMetadata
} from "zakhaarif-dev-tools"
import {NullPrototype} from "../utils/nullProto"

export class MetaIndex extends NullPrototype implements MetaUtilities {
	modVersionIndex: Map<string, string>
	componentIndex: Map<string, ComponentClass>
    
	constructor() {
		super()
		this.modVersionIndex = new Map()
		this.componentIndex = new Map()
	}

	getModVersion(modName: string): string {
		return this.modVersionIndex.get(modName) || ""
	}

	getComponentMeta(componentName: string): ComponentMetadata | null {
		return this.componentIndex.get(componentName) || null
	}
}