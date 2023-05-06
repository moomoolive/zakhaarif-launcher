import {JsHeapRef} from "zakhaarif-dev-tools"
import {
	ComponentContextString,
	layoutMapName,
	layoutMapRegistryName,
	pointerViewI32Name,
	PointerViewInstance,
	LayoutMap
} from "./componentObject"

export type HydratedComponentObjectContext = {
    [layoutMapName]: {
        new(args?: Partial<LayoutMap>): LayoutMap
    }
    [layoutMapRegistryName]: Array<LayoutMap>
    [pointerViewI32Name]: { new(): PointerViewInstance }
}

export type ComponentHydrationArgs = JsHeapRef

export function hydrateComponentObjectContext(
	ctx: ComponentContextString,
	heap: JsHeapRef
): HydratedComponentObjectContext {
    type ContextConstructor = (
        () => (params: ComponentHydrationArgs) => HydratedComponentObjectContext
    )
    const ctxFn = Function(`return ${ctx}`) as ContextConstructor
    const construct = ctxFn()
    return construct(heap)
}