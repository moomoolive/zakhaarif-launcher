import {NullPrototype} from "../utils/nullProto"
import {
	EcsSystem,
	EcsSystemManager,
	MainThreadEngine
} from "zakhaarif-dev-tools"

export class SystemManager extends NullPrototype implements EcsSystemManager {
	systems: Array<EcsSystem>

	constructor() {
		super()
		this.systems = []
	}
    
	add(system: EcsSystem): number {
		this.systems.push(system)
		return this.systems.length - 1
	}

	run(engine: MainThreadEngine): number {
		const {systems} = this
		const len = systems.length
		for (let i = 0; i < len; i++) {
			const system = systems[i]
			system(engine)
		}
		return 0
	}
}