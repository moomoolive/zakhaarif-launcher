import type {
	Allocator,
	TimeUtils,
	ModMetadata
} from "zakhaarif-dev-tools"
import type {
	ShaheenEngineImpl,
	EcsImpl,
	EcsSystemImpl
} from "zakhaarif-dev-tools/implement"
import {
	calloc, 
	realloc,
	malloc,
	free,
} from "./engine_allocator/pkg/engine_allocator"

class Heap implements Allocator {
	malloc = malloc
	calloc = calloc
	free = free
	realloc = realloc

	private wasmMemory: WebAssembly.Memory

	constructor(wasmMemory: WebAssembly.Memory) {
		this.wasmMemory = wasmMemory
	}
	
	getRawMemory(): WebAssembly.Memory {
		return this.wasmMemory
	}
}

type EcsConfig = {
    engine: ShaheenEngineImpl
}

export class EngineEcs implements EcsImpl {
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

export type EngineConfig = {
    rootCanvas: HTMLCanvasElement
	heapMemory: WebAssembly.Memory
}

export type CompiledState = Record<string, object>
export type CompiledResources = Record<string, Record<string, string>>
export type CompiledModMetadata = Record<string, ModMetadata>

export class Engine implements ShaheenEngineImpl {
	heap: Heap
	ecs: EngineEcs
	originTime: number
	previousFrame: number
	elapsedTime: number
	modState: CompiledState
	modResources: CompiledResources
	modMetaData: CompiledModMetadata
	isRunning: boolean
    
	readonly time: TimeUtils

	private canvas: HTMLCanvasElement

	constructor(config: EngineConfig) {
		this.heap = new Heap(config.heapMemory)
		this.isRunning = true
		const self = this
		this.ecs = new EngineEcs({engine: self})
		this.modState = {}
		this.modResources = {}
		this.modMetaData = {}
		this.originTime = 0.0
		this.previousFrame = 0.0
		this.elapsedTime = 0.0
		this.canvas = config.rootCanvas
		this.time = {
			originTime: () => self.originTime,
			previousFrameTime: () => self.previousFrame,
			totalElapsedTime: () => (self.previousFrame - self.originTime) + self.elapsedTime
		}
	}

	getRootCanvas(): HTMLCanvasElement {
		return this.canvas
	}

	getDeltaTime(): number {
		return this.elapsedTime
	}

	state(): CompiledState {
		return this.modState
	}

	resouces(): CompiledResources {
		return this.modResources
	}

	metadata(): CompiledModMetadata {
		return this.modMetaData
	}
}