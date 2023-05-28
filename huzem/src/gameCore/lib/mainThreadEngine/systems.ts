import {Null} from "../utils"
import {
	EcsSystem,
	MainThreadEngine
} from "zakhaarif-dev-tools"

type EcsSystemManager = MainThreadEngine["systems"]

export class SystemManager extends Null implements EcsSystemManager {
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