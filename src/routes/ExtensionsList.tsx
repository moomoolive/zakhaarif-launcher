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

const SEARCH_BAR_ID = "extensions-search-bar"

type FilterTypes = "updated" | "name"

const ExtensionsListPage = (): JSX.Element => {
    const {database} = useAppShellContext()

    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(true)
    const [searchText, setSearchText] = useState("")
    const [filter, setFilter] = useState<FilterTypes>("updated")
    const [order, setOrder] = useState<FilterOrder>(DESCENDING_ORDER)
    const [filteredCargos, setFilteredCargos] = useState<CargoIndex[]>([])
    const [queryTime, setQueryTime] = useState(0)
    const [extensionCount] = useAsyncState(database.cargoIndexes.extensionCount())

    const gameSaveExists = useRef(Boolean(window.localStorage.getItem(SAVE_EXISTS)))

    useEffectAsync(async () => {
        setLoading(true)
        const minimumTime = sleep(200)
        const start = Date.now()
        const query = await database.cargoIndexes.getExtensions({
            sort: filter,
            order,
            offset: 0,
            limit: 25
        })
        setQueryTime(Date.now() - start)
        await minimumTime
        setFilteredCargos(query)
        setLoading(false)
    }, [searchText, filter, order])

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
    }

    if (error) {
        return <ErrorOverlay>
            <div className="text-neutral-400 mb-1">
                An error occurred when search for Extensions
            </div>
            <Link to="/start">
                <Button>
                    Back to Home
                </Button>
            </Link>
        </ErrorOverlay>
    }
    
    return <div className="fixed z-0 w-screen h-screen overflow-clip">
        <div className="w-full h-full overflow-clip">
            <div className="w-full flex flex-col sm:flex-row">
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
                            {`${extensionCount.loading ? 0 : extensionCount.data} results (${roundDecimal(queryTime / MILLISECONDS_PER_SECOND, 2)} seconds)`}
                        </span>
                    </div>
                </div>
            </div>

            <div className="px-5 mb-2 flex text-sm">
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

            {loading ? <>
                <div 
                    className="w-full flex items-center justify-center sm:justify-start flex-wrap p-4 sm:p-8"
                    style={{maxHeight: "80%"}}
                >
                    <div>
                        <div className="text-blue-500 text-4xl">
                            <div className="animate-spin">
                                <LoadingIcon/>
                            </div>
                        </div>
                    </div>
                </div>
            </> : <>
                <div 
                    className="w-full flex items-start justify-center sm:justify-start flex-wrap p-4 sm:p-8 overflow-y-scroll"
                    style={{maxHeight: "80%"}}
                >
                    {filteredCargos.map((cargo, index) => {
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
                </div>
            </>}
        </div>
    </div>
}

export default ExtensionsListPage