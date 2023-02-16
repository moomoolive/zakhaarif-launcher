import {useAppShellContext} from "./store"
import {CargoIndex} from "../lib/shabah/downloadClient"
import { useEffect, useMemo, useState, useRef } from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {io} from "../lib/monads/result"
import {FullScreenLoadingOverlay} from "../components/LoadingOverlay"
import {ErrorOverlay} from "../components/ErrorOverlay"
import {Link} from "react-router-dom"
import {
    Button, 
    IconButton, 
    Tooltip,
    InputAdornment,
    TextField,
    Skeleton,
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft, faMagnifyingGlass} from "@fortawesome/free-solid-svg-icons"
import {EXTENSION_SHELL_TARGET} from "../lib/utils/searchParameterKeys"
import {CargoIcon} from "../components/cargo/Icon"
import {FilterOrder, FilterChevron, DESCENDING_ORDER, ASCENDING_ORDER} from "../components/FilterChevron"
import {SAVE_EXISTS} from "../lib/utils/localStorageKeys"
import { sleep } from "../lib/utils/sleep"
import LoadingIcon from "../components/LoadingIcon"
import { roundDecimal } from "../lib/math/rounding"
import { MILLISECONDS_PER_SECOND } from "../lib/utils/consts/time"
import { useAsyncState } from "../hooks/promise"
import { Paginator } from "../components/Paginator"
import { useDebounce } from "../hooks/debounce"
import { EXTENSION_CARGO_TAG } from "../config"

const SEARCH_BAR_ID = "extensions-search-bar"

type FilterTypes = "updated" | "name"

const extensionTilesSkeleton = <div 
    className="w-full mx-auto max-w-screen-lg flex items-start justify-center sm:justify-start flex-wrap p-4 sm:p-8"
>
    {new Array<number>(10).fill(0).map((_, index) => {
        return <div
            key={`extension-tile-${index}`}
            className="animate-pulse mr-5 sm:mr-8 mb-3"
        >
            <div className="mb-1.5">
                <Skeleton 
                    animation={false}
                    height={80}
                    width={80}
                    variant="rounded"
                />
            </div>

            <div>
                {new Array<number>(3).fill(0).map((_, index) => {
                    return <Skeleton
                        key={`name-skeleton-${index}`}
                        animation={false}
                        height={14}
                        width={80}
                        className="mb-1"
                    />
                })}
            </div>
        </div>
    })}
</div>

const PAGE_LIMIT = 32

const ExtensionsListPage = (): JSX.Element => {
    const {database} = useAppShellContext()
    const textSearchDelay = useDebounce(300)

    const [loading, setLoading] = useState(true)
    const [searchText, setSearchText] = useState("")
    const [filter, setFilter] = useState<FilterTypes>("updated")
    const [order, setOrder] = useState<FilterOrder>(DESCENDING_ORDER)
    const [offset, setOffset] = useState(0)
    const [queryTime, setQueryTime] = useState(0)
    const [extensionCount, setExtensionCount] = useState(0)
    const [cargoQuery, setCargoQuery] = useState({
        results: [] as CargoIndex[],
        sort: "",
        order: DESCENDING_ORDER as FilterOrder,
        offset: 0,
        searchText: "",
        more: false
    })

    const gameSaveExists = useRef(Boolean(window.localStorage.getItem(SAVE_EXISTS)))

    useEffectAsync(async () => {
        const [count] = await Promise.all([
            database.cargoIndexes.extensionCount()
        ] as const)
        setExtensionCount(count)
    }, [])

    useEffectAsync(async () => {
        if (extensionCount < 1) {
            return
        }
        
        if (searchText.length > 0) {
            setLoading(true)
            textSearchDelay(async () => {
                const start = Date.now()
                const query = await database.cargoIndexes.similaritySearchWithTag(
                    EXTENSION_CARGO_TAG,
                    {
                        text: searchText,
                        sort: filter,
                        order,
                        limit: PAGE_LIMIT
                    }
                )
                setQueryTime(Date.now() - start)
                setCargoQuery({
                    results: query,
                    order,
                    sort: filter,
                    offset: 0,
                    more: false,
                    searchText
                })
                setLoading(false)
            })
            return
        }
        setLoading(offset === 0)
        const minimumTime = sleep(400)
        const start = Date.now()
        const query = await database.cargoIndexes.getExtensions({
            sort: filter,
            order,
            offset,
            limit: PAGE_LIMIT
        })
        setQueryTime(Date.now() - start)
        await minimumTime
        const results = offset === 0
            ? query
            : [...cargoQuery.results, ...query]
        setCargoQuery({
            results,
            order,
            sort: filter,
            offset,
            searchText: "",
            more: results.length < extensionCount
        })
        setLoading(false)
    }, [searchText, filter, order, offset, extensionCount])

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            const searchBar = document.getElementById(SEARCH_BAR_ID)
            if (searchBar) {
                searchBar.focus()
            }
        }, 100)
        return () => window.clearTimeout(timerId)
    }, [])

    const toggleFilter = (filterName: typeof filter) => {
        if (filter !== filterName) {
            setFilter(filterName)
            setOrder(DESCENDING_ORDER)
        } else if (order === DESCENDING_ORDER) {
            setOrder(ASCENDING_ORDER)
        } else {
            setOrder(DESCENDING_ORDER)
        }
        setOffset(0)
    }
    
    return <div className="fixed z-0 w-screen h-screen overflow-clip">
        <div className="w-full h-full overflow-clip">
            <div className="w-full mx-auto max-w-screen-lg flex flex-col sm:flex-row">
                <div className="ml-2">
                    <Tooltip title="Back">
                        <Link to="/start">
                            <IconButton size="large">
                                <span className="text-xl">
                                    <FontAwesomeIcon 
                                        icon={faArrowLeft}
                                    />
                                </span>
                            </IconButton>
                        </Link>
                    </Tooltip>
                </div>

                <div className="px-4 mb-1 sm:mt-2 sm:w-11/12 max-w-screen-sm">
                    <div className="mb-1">
                        <TextField
                            fullWidth
                            size="small"
                            id={SEARCH_BAR_ID}
                            name="search-bar"
                            className="rounded"
                            placeholder="Extension..."
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start">
                                    <span className="text-neutral-300">
                                        <FontAwesomeIcon
                                            icon={faMagnifyingGlass}
                                        />
                                    </span>
                                </InputAdornment>
                            }}
                        />
                    </div>
                        
                    <div className="text-xs px-1 mb-2">
                        <span className="text-neutral-400">
                            {`${extensionCount.toLocaleString("en-us")} extensions`}
                        </span>
                    </div>
                </div>
            </div>

            <div className="w-full mx-auto max-w-screen-lg px-5 mb-2 flex text-sm">
                {(["updated", "name"] as const).map((name, index, filters) => {
                    return <div
                        key={`filter-selector-${index}`}
                        className={index === filters.length - 1 ? "" : "mr-4"}
                    >
                        <button
                            className="hover:bg-gray-900 rounded px-2 py-1"
                            onClick={() => toggleFilter(name)}
                        >
                            {name.slice(0, 1).toUpperCase() + name.slice(1)}
                            <FilterChevron 
                                currentFilter={filter}
                                targetFilter={name}
                                order={order}
                                className="ml-2 text-blue-500"
                            />
                        </button>
                    </div>
                })}
            </div>
            
            <div className="w-full overflow-y-scroll h-4/5">
                {loading ? <>
                    {extensionTilesSkeleton}
                </> : <>
                    {cargoQuery.results.length < 1 ? <>
                        <div className="w-full text-center">
                            <div>
                                <div className="text-yellow-500 mb-3 text-4xl mt-16">
                                    <FontAwesomeIcon icon={faMagnifyingGlass}/>
                                </div>
                                <div className="text-sm text-neutral-400">
                                    {"No extensions found..."}
                                </div>
                            </div>
                        </div>
                    </> : <div className="w-full mx-auto max-w-screen-lg flex items-start justify-center sm:justify-start flex-wrap p-4 sm:p-8 animate-fade-in-left">
                        {cargoQuery.results.map((cargo, index) => {
                            const {logo, resolvedUrl, name} = cargo
                            return <div
                                key={`extension-${index}`}
                                className="mr-5 sm:mr-8 mb-1"
                            >
                                <Link 
                                    to={((cargoIndex: CargoIndex) => {
                                        const entry = cargoIndex.canonicalUrl
                                        switch (cargoIndex.canonicalUrl) {
                                            case import.meta.env.VITE_APP_LAUNCHER_CARGO_URL:
                                                return "/"
                                            case import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL:
                                                if (!gameSaveExists.current) {
                                                    return "/new-game"
                                                }
                                                return `/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(entry)}&state=-1`
                                            default:
                                                return `/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(entry)}`
                                        }
                                    })(cargo)}
                                >
                                    <button className="text-neutral-300 hover:text-blue-500">
                                        <div className="mb-3">
                                            <CargoIcon 
                                                pixels={80}
                                                importUrl={resolvedUrl}
                                                crateLogoUrl={logo}
                                                className="hover:shadow-2xl"
                                            />
                                        </div>
                                        <Tooltip title={`Open ${name}`} placement="top">
                                            <div 
                                                className="text-center text-sm h-16 overflow-clip text-ellipsis"
                                                style={{maxWidth: "80px"}}
                                            >
                                                {name}
                                            </div>
                                        </Tooltip>
                                    </button>
                                </Link>
                            </div>
                        })}
                        
                        {cargoQuery.more ? <>
                            <Paginator
                                id="extension-cargo-paginator"
                                threshold={[0, 0.5, 1]}
                                onPaginate={() => {
                                    setOffset((previous) => previous + PAGE_LIMIT)
                                }}
                                className="animate-pulse mr-5 sm:mr-8 mb-3"
                            >
                                <div className="mb-1.5">
                                    <Skeleton 
                                        animation={false}
                                        height={80}
                                        width={80}
                                        variant="rounded"
                                    />
                                </div>

                                <div>
                                    {new Array<number>(3).fill(0).map((_, index) => {
                                        return <Skeleton
                                            key={`name-skeleton-${index}`}
                                            animation={false}
                                            height={14}
                                            width={80}
                                            className="mb-1"
                                        />
                                    })}
                                </div>
                            </Paginator>
                        </> : <></>}
                    </div>}
                    
                    
                </>}
            </div>

            <div className="w-full px-4 mx-auto max-w-screen-lg text-xs">
                <span className="text-neutral-500">
                    {`${cargoQuery.results.length.toLocaleString("en-us")} results (${roundDecimal(queryTime / MILLISECONDS_PER_SECOND, 2)} seconds)`}
                </span>
            </div>
        </div>
    </div>
}

export default ExtensionsListPage