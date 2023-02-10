import { useEffect, useRef, useState } from "react"

type SearchParams = [
    URLSearchParams,
    (update: URLSearchParams) => void
]

export const useSearchParams = (): SearchParams => {
    const [searchParams, setSearch] = useState(new URLSearchParams(location.search))
    
    const searchRef = useRef(location.search)
    const {current: setSearchParams} = useRef((newSearchParams: URLSearchParams) => {
        const newSearchString = newSearchParams.toString()
        searchRef.current = newSearchString
        const search = newSearchString.length > 0 ? `?${newSearchString}` : ""
        const hash = location.hash.length > 0 ? `#${location.hash}` : ""
        history.pushState("", "", `${location.pathname}${search}${hash}`)
        setSearch(newSearchParams)
    })

    useEffect(() => {
        const handler = () => {
            if (searchRef.current === location.search) {
                return
            }
            searchRef.current = location.search
            setSearch(new URLSearchParams(location.search))
        }
        window.addEventListener("popstate", handler)
        return () => window.removeEventListener("popstate", handler)
    }, [])
    
    return [searchParams, setSearchParams]
}