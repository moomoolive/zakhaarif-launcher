import {lazy, Suspense, PropsWithRef} from "react"

type ComponentProps<T> = (
    PropsWithRef<T> 
    & JSX.IntrinsicAttributes
)

export type LazyComponent<T> = (props: ComponentProps<T>) => JSX.Element

export type ComponentLoader<T> = () => Promise<LazyComponent<T>>

export type LazyComponentOptions = {
    loadingElement?: React.ReactNode
}

export function lazyComponent<T>(
	loader: ComponentLoader<T>,
	{ 
		loadingElement = null
	}: LazyComponentOptions = {}
) {
	const Route = lazy(async () => ({default: await loader()})) as (props: ComponentProps<T>) => JSX.Element
	return (props: ComponentProps<T> = {} as ComponentProps<T>) => {
		return <Suspense fallback={loadingElement}>
			<Route {...props}/>
		</Suspense>
	}
}
