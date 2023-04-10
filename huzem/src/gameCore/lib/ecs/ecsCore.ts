import {ShaheenEngine, Ecs, EcsSystem} from "zakhaarif-dev-tools"

type EcsConfig = {
    engine: ShaheenEngine
}

export class EcsCore implements Ecs {
	engine: ShaheenEngine
	systems: Array<EcsSystem>

	constructor(config: EcsConfig) {
		this.engine = config.engine
		this.systems = []
	}
    
	addSystem(system: EcsSystem): number {
		this.systems.push(system)
		return this.systems.length - 1
	}

	step(): number {
		const {systems, engine} = this
		const len = systems.length
		for (let i = 0; i < len; i++) {
			const system = systems[i]
			system(engine)
		}
		return 0
	}
}