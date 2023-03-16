import {ModView, ModModule} from "zakhaarif-dev-tools"

export class ModWrapper implements ModView {
	readonly canonicalUrl: string
	readonly resolvedUrl: string
	readonly alias: string
	readonly dependencies: string[]
	readonly originalModule: ModModule
    
	readonly resources: object
	state: object

	constructor(config: ModWrapper) {
		this.canonicalUrl = config.canonicalUrl
		this.resolvedUrl = config.resolvedUrl
		this.alias = config.alias
		this.dependencies = config.dependencies
		this.originalModule = config.originalModule
		this.state = config.state
		this.resources = config.resources
	}
}