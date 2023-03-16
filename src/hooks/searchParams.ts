import {useEffect, useRef, useState} from "react"

type SearchParams = [
    URLSearchParams,
    (update: URLSearchParams) => void
]

export const useSearchParams = (): SearchParams => {
	const state = useState(new URLSearchParams(location.search))
	const [searchParams, setSearch] = state

	const searchRef = useRef(location.search)
	
	const setSearchParams = (newSearchParams: URLSearchParams) => {
		const newSearchString = newSearchParams.toString()
		searchRef.current = newSearchString
		const search = newSearchString.length > 0 ? `?${newSearchString}` : ""
		const hash = location.hash.length > 0 ? `#${location.hash}` : ""
		history.pushState("", "", `${location.pathname}${search}${hash}`)
		setSearch(newSearchParams)
	}
	
	useEffect(() => {
		const handler = () => {
			const targetLocation = location.search.startsWith("?")
				? location.search.slice(1)
				: location
			if (searchRef.current === targetLocation) {
				return
			}
			setSearchParams(new URLSearchParams(location.search))
		}
		window.addEventListener("popstate", handler)
		return () => window.removeEventListener("popstate", handler)
	}, [])
    
	return [searchParams, setSearchParams]
}