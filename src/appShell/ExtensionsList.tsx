import {useAppShellContext} from "./store"
import {emptyCargoIndices} from "../lib/shabah/backend"
import {CargoIndex} from "../lib/shabah/wrapper"
import { useEffect, useMemo, useState } from "react"
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
import {
    faArrowLeft,
    faPuzzlePiece, 
    faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons"
import {
    APP_CARGO_ID, 
    GAME_EXTENSION_ID, 
    ADD_ON_MANAGER_EXTENSION_ID,
    EXTENSION_CARGO_ID_PREFIX
} from "../config"
import {NULL_FIELD as CARGO_NULL_FIELD} from "../lib/cargo/consts"
import {CargoIcon} from "../components/cargo/Icon"
import {FilterOrder, FilterChevron} from "../components/FilterChevron"

const GAME_CARGO_INDEX: CargoIndex = {
    id: GAME_EXTENSION_ID,
    name: "Game",
    logoUrl: CARGO_NULL_FIELD,
    storageRootUrl: "",
    requestRootUrl: "",
    bytes: 0,
    entry: "",
    version: "0.1.0",
    state: "cached",
    createdAt: 0,
    updatedAt: 0
} as const

const ADD_ON_MANAGER_CARGO_INDEX: CargoIndex = {
    id: ADD_ON_MANAGER_EXTENSION_ID,
    name: "Add-ons",
    logoUrl: CARGO_NULL_FIELD,
    storageRootUrl: "",
    requestRootUrl: "",
    bytes: 0,
    entry: "",
    version: "0.1.0",
    state: "cached",
    createdAt: 0,
    updatedAt: 0
} as const

const SEARCH_BAR_ID = "extensions-search-bar"

const FILTERS = ["modified", "name"] as const


const ExtensionsListPage = () => {
    const {downloadClient} = useAppShellContext()

    const [cargoIndex, setCargoIndex] = useState(emptyCargoIndices())
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(true)
    const [searchText, setSearchText] = useState("")
    type FilterTypes = typeof FILTERS[number]
    const [filter, setFilter] = useState<FilterTypes>("modified")
    const [order, setOrder] = useState<FilterOrder>("descending")

    useEffectAsync(async () => {
        const indicesRes = await io.wrap(downloadClient.getCargoIndices())
        if (!indicesRes.ok) {
            setError(true)
            setLoading(false)
            return
        }
        const {data} = indicesRes
        const extensionCargos = data.cargos.filter((cargo) => cargo.id.startsWith(EXTENSION_CARGO_ID_PREFIX))
        const appLauncherCargoIndex = data.cargos.findIndex((cargo) => cargo.id === APP_CARGO_ID)
        let cargos: CargoIndex[]
        if (appLauncherCargoIndex < 0) {
            cargos = [
                ...extensionCargos,
                {...GAME_CARGO_INDEX},
                {...ADD_ON_MANAGER_CARGO_INDEX}
            ]
        } else {
            const {updatedAt} = data.cargos[appLauncherCargoIndex]
            cargos = [
                ...extensionCargos,
                {...GAME_CARGO_INDEX, updatedAt},
                {...ADD_ON_MANAGER_CARGO_INDEX, updatedAt}
            ]
        }
        setCargoIndex({...data, cargos})
        setLoading(false)
    }, [])

    const filteredCargos = useMemo(() => {
        const {cargos} = cargoIndex
        if (cargos.length < 1) {
            return []
        }
        const results = []
        for (let i = 0; i < cargos.length; i++) {
            const cargo = cargos[i]
            if (cargo.id.includes(searchText)) {
                results.push({...cargo})
            }
        }
        const orderFactor = order === "ascending" ? 1 : -1
        switch (filter) {
            case "name":
                return results.sort((a, b) => {
                    return a.name.localeCompare(b.name) * orderFactor
                })
            case "modified":
                return results.sort((a, b) => {
                    return (a.updatedAt > b.updatedAt ? 1 : -1) * orderFactor
                })
            default:
                return results
        }
    }, [cargoIndex, searchText, filter, order])

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
            setOrder("descending")
        } else if (order === "descending") {
            setOrder("ascending")
        } else {
            setOrder("descending")
        }
    }
    
    return <FullScreenLoadingOverlay
        loading={loading}
    >
        {error ? <>
            <ErrorOverlay>
                <div className="text-neutral-400 mb-1">
                    An error occurred when search for Extensions
                </div>
                <Link to="/start">
                    <Button>
                        Back to Home
                    </Button>
                </Link>
            </ErrorOverlay>
        </> : <>
            <div className="fixed z-0 w-screen h-screen overflow-clip">
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
                        <div className="px-4 mb-3 sm:mb-2 sm:mt-2 sm:w-11/12 max-w-screen-sm">
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
                    </div>

                    <div className="px-5 mb-2 flex text-sm">
                        {(["modified", "name"] as const).map((name, index, filters) => {
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

                    <div 
                        className="w-full flex items-start justify-center sm:justify-start flex-wrap p-4 sm:p-8 overflow-y-scroll"
                        style={{maxHeight: "80%"}}
                    >
                        {filteredCargos.map((cargo, index) => {
                            const {logoUrl, requestRootUrl, name, id} = cargo
                            const isAddonManager = id === ADD_ON_MANAGER_EXTENSION_ID 
                            return <div
                                key={`extension-${index}`}
                                className="mr-5 sm:mr-8 mb-1"
                            >
                                <Link 
                                    to={((extensionId: string) => {
                                        switch (extensionId) {
                                            case APP_CARGO_ID:
                                                return "/start"
                                            case ADD_ON_MANAGER_EXTENSION_ID:
                                                return "/add-ons"
                                            default:
                                                return `/extension?id=${id}`
                                        }
                                    })(id)}
                                >
                                    <button className="text-neutral-300 hover:text-blue-500">
                                        <div className="mb-3">
                                            <CargoIcon 
                                                pixels={80}
                                                importUrl={requestRootUrl}
                                                crateLogoUrl={logoUrl}
                                                className="hover:shadow-2xl"
                                                customIcon={isAddonManager ? <div
                                                    className="text-green-500 mb-1 ml-1"
                                                >
                                                    <FontAwesomeIcon 
                                                        icon={faPuzzlePiece}
                                                    />
                                                </div> : null}
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
                </div>
            </div>
        </>}
    </FullScreenLoadingOverlay>
}

export default ExtensionsListPage