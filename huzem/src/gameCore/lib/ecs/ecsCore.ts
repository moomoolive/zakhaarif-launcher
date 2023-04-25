import {ShaheenEngine, Ecs, EcsSystem} from "zakhaarif-dev-tools"

export class EcsCore implements Ecs {
	systems: Array<EcsSystem>

	constructor(_config = {}) {
		this.systems = []
	}
    
	addSystem(system: EcsSystem): number {
		this.systems.push(system)
		return this.systems.length - 1
	}

	step(engine: ShaheenEngine): number {
		const {systems} = this
		const len = systems.length
		for (let i = 0; i < len; i++) {
			const system = systems[i]
			system(engine)
		}
		return 0
	}
}