import type {
	ShaheenEngineImpl,
	EcsImpl,
	EcsSystemImpl
} from "zakhaarif-dev-tools/implement"

type EcsConfig = {
    engine: ShaheenEngineImpl
}

export class EcsCore implements EcsImpl {
	engine: ShaheenEngineImpl
	systems: Array<EcsSystemImpl>

	constructor(config: EcsConfig) {
		this.engine = config.engine
		this.systems = []
	}
    
	addSystem(system: EcsSystemImpl): number {
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