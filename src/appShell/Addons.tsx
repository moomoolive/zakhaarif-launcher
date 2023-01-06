import {useState, useMemo} from "react"
import {useEffectAsync} from "@/hooks/effectAsync"
import {FullScreenLoadingOverlay} from "@/components/LoadingOverlay"
import {ErrorOverlay} from "@/components/ErrorOverlay"
import {
    Button, 
    Tooltip,
    Fab,
    TextField,
    InputAdornment
} from "@mui/material"
import {Link} from "react-router-dom"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faFolder, 
    faPuzzlePiece, 
    faHardDrive,
    faSignal,
    faArrowLeft,
    faPlus,
    faCaretDown,
    faBoxArchive,
    faGear,
    faMagnifyingGlass,
    faChevronDown,
    faChevronUp
} from "@fortawesome/free-solid-svg-icons"
import {readableByteCount, toGigabytesString} from "@/lib/utils/storage/friendlyBytes"
import {reactiveDate} from "@/lib/utils/dates"
import {Divider, LinearProgress} from "@mui/material"
import {useAppShellContext} from "./store"
import {io} from "@/lib/monads/result"
import {emptyCargoIndices, CargoState} from "@/lib/shabah/backend"
import UpdatingAddonIcon from "@mui/icons-material/Sync"
import FailedAddonIcon from "@mui/icons-material/ReportProblem"

const filterOptions = [
    "updatedAt", "bytes", "state", "addon-type", "name"
] as const

const isAMod = (id: string) => id === "std-pkg" || id.startsWith("pkg-")

const cargoStateToNumber = (state: CargoState) => {
    switch (state) {
        case "update-aborted":
        case "update-failed":
            return 3
        case "updating":
            return 2
        case "cached":
            return 1
        default:
            return 0
    }
}

type FilterOrder = "ascending" | "descending"

const filterChevron = (
    currentFilter: string, 
    targetFilter: string,
    order: FilterOrder
) => {
    if (currentFilter !== targetFilter) {
        return <span className={`ml-2`}>
            <FontAwesomeIcon 
                icon={faChevronDown}
            />
        </span>
    } else if (order === "descending") {
        return <span className={`ml-2 text-blue-500`}>
            <FontAwesomeIcon 
                icon={faChevronDown}
            />
        </span>
    } else {
        return <span className={`ml-2 text-blue-500`}>
            <FontAwesomeIcon 
                icon={faChevronUp}
            />
        </span>
    }
}

const AddOns = () => {
    const {downloadClient} = useAppShellContext()

    const [
        loadingInitialData, 
        setLoadingInitialData
    ] = useState(true)
    const [isInErrorState, setIsInErrorState] = useState(false)
    const [currentPath] = useState("")
    const [cargoIndex, setCargoIndex] = useState(
        emptyCargoIndices()
    )
    const [storageUsage, setStorageUsage] = useState({
        used: 0, total: 0
    })
    const [searchText, setSearchText] = useState("")
    const [filter, setFilter] = useState<typeof filterOptions[number]>("updatedAt")
    const [order, setOrder] = useState<FilterOrder>("descending")

    useEffectAsync(async () => {
        const [cargoIndexRes, clientStorageRes] = await Promise.all([
            io.wrap(downloadClient.getCargoIndices()),
            io.wrap(downloadClient.getStorageUsage()),
        ] as const)
        setLoadingInitialData(false)
        if (!clientStorageRes.ok || !cargoIndexRes.ok) {
            setIsInErrorState(true)
            return
        }
        const data = cargoIndexRes.data 
        const copy = {...data.cargos[0]}
        const cargos = [
            copy,
            {   
                ...copy, 
                id: `pkg-${~~(Math.random() * 1_000_000)}`,
                name: `std-${~~(Math.random() * 1_000_000)}`,
                state: "updating" as const
            },
            {   
                ...copy, 
                id: `ext-${~~(Math.random() * 1_000_000)}`,
                name: `std-${~~(Math.random() * 1_000_000)}`,
                state: "update-aborted" as const
            },
        ]
        for (let i = 0; i < 100; i++) {
            const idPrefix = (i % 2 === 0) ? "pkg" : "ext"
            cargos.push({   
                ...copy, 
                id: `${idPrefix}-${~~(Math.random() * 1_000_000)}`,
                name: `${idPrefix}-${~~(Math.random() * 1_000_000)}`,
                updatedAt: copy.updatedAt - ~~(Math.random() * 1_000_000_000),
                bytes: ~~(Math.random() * 100_000_000) 
            })
        }
        setCargoIndex({...cargoIndexRes.data, cargos})
        setStorageUsage(clientStorageRes.data)
    }, [])

    const filteredCargos = useMemo(() => {
        const orderFactor = order === "ascending" ? 1 : -1
        const copy = []
        for (let i = 0; i < cargoIndex.cargos.length; i++) {
            const targetCargo = cargoIndex.cargos[i]
            if (
                targetCargo.state === "archived" 
                || !targetCargo.name.includes(searchText)
            ) {
                continue
            }
            copy.push({...targetCargo})
        }
        switch (filter) {
            case "updatedAt":
                return copy.sort((a, b) => {
                    const order = a.updatedAt > b.updatedAt ? 1 : -1
                    return order * orderFactor
                })
            case "bytes":
                return copy.sort((a, b) => {
                    const order = a.bytes > b.bytes ? 1 : -1
                    return order * orderFactor
                })
            case "state":
                return copy.sort((a, b) => {
                    const stateA = cargoStateToNumber(a.state)
                    const stateB = cargoStateToNumber(b.state)
                    const order = stateA > stateB ? 1 : -1
                    return order * orderFactor
                })
            case "addon-type":
                return copy.sort((a, b) => {
                    const order = isAMod(a.id) && !isAMod(b.id)
                        ? 1
                        : -1
                    return order * orderFactor
                })
            case "name":
                return copy.sort((a, b) => {
                    return a.name.localeCompare(b.name) * orderFactor
                })
            default:
                return copy
        }
    }, [filter, order, cargoIndex, searchText])

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
        loading={loadingInitialData}
    >
        {isInErrorState ? <ErrorOverlay>
            <div className="text-gray-400 mb-1">
                An error occurred when search for files
            </div>
            <Link to="/start">
                <Button>
                    Back to Home
                </Button>
            </Link>
        </ErrorOverlay> : <>
            <div className="fixed z-0 w-screen h-screen overflow-clip">
                <div className="w-full h-1/12 flex items-center justify-center">
                    <div className="w-1/5">
                        <Tooltip title="Back">
                            <Link to="/start">
                                <Button size="large">
                                    <span className="text-xl">
                                        <FontAwesomeIcon 
                                            icon={faArrowLeft}
                                        />
                                    </span>
                                </Button>
                            </Link>
                        </Tooltip>
                    </div>
                    <div className="w-4/5">
                        <div className="w-3/5 ml-10">
                            <TextField
                                fullWidth
                                size="small"
                                id="add-ons-search-bar"
                                name="search-bar"
                                className="rounded"
                                placeholder="Search for add-on..."
                                value={searchText}
                                onChange={(event) => setSearchText(event.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">
                                        <span className="text-gray-300">
                                            <FontAwesomeIcon
                                                icon={faMagnifyingGlass}
                                            />
                                        </span>
                                    </InputAdornment>
                                }}
                            />
                        </div>
                    </div>
                </div>
                
                <div className="w-full h-11/12 flex items-center justify-center">
                    <Divider className="bg-neutral-200"/>

                    <div className="w-60 h-full text-sm">
                        <Divider className="bg-neutral-200"/>

                        <div className="p-4">
                            <span className="mr-2 text-green-500">
                                <FontAwesomeIcon
                                    icon={faPuzzlePiece}
                                />
                            </span>
                            {"Add-On Manager"}
                        </div>

                        <Divider className="bg-neutral-200"/>

                        <div className="p-4">
                            <Tooltip title="Add a New Package">
                                <Fab variant="extended">
                                    <div className="flex items-center justify-center">
                                        <div className="mr-2">
                                            <span className="text-lg">
                                                <FontAwesomeIcon
                                                    icon={faPlus}
                                                />
                                            </span>
                                        </div>
                                        <div>
                                            New Package
                                        </div>
                                    </div>                                
                                </Fab>
                            </Tooltip>
                        </div>
                        
                        <div className="text-lg pb-4 text-gray-300 w-11/12 rounded-r-full">
                            <Button fullWidth>
                                <div className="w-full pl-4 py-1 text-left">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faSignal}
                                        />
                                    </span>
                                    Stats
                                </div>
                            </Button>

                            <Button fullWidth>
                                <div className="w-full pl-4 py-1 text-left">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faBoxArchive}
                                        />
                                    </span>
                                    Archives
                                </div>
                            </Button>

                            <Button fullWidth>
                                <div className="w-full pl-4 py-1 text-left">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faGear}
                                        />
                                    </span>
                                    Settings
                                </div>
                            </Button>
                        </div>

                        <Divider className="bg-neutral-200  w-11/12"/>

                        <div className="text-lg text-gray-300 w-11/12 rounded-r-full">
                            <Button fullWidth disabled>
                                <div className="w-full text-left pl-4">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faHardDrive}
                                        />
                                    </span>
                                    Storage
                                </div>
                            </Button>
                        </div>

                        <div className="ml-16">
                            <div className="w-7/12 mb-2">
                                <LinearProgress 
                                    variant="determinate" 
                                    value={
                                        loadingInitialData || isInErrorState
                                            ? 3
                                            : Math.max(
                                                3,
                                                storageUsage.used / storageUsage.total 
                                            ) 
                                    } 
                                />
                            </div>
                            

                            <div className="py-1 text-xs">
                                {loadingInitialData ? <span 
                                    className="animate-pulse"
                                >
                                    {"calculating..."}
                                </span> : <>
                                    {isInErrorState
                                        ? "unknown"
                                        : `${toGigabytesString(storageUsage.used, 1)} of ${toGigabytesString(storageUsage.total, 1)} used` 
                                    }
                                </>}
                            
                            </div>

                            <div className="text-xs text-gray-400">
                                1 packages
                            </div>
                        </div>

                    </div>
                    
                    <div className="w-4/5 h-full">
                        <Divider className="bg-neutral-200"/>

                        <div className=" text-sm text-gray-300 p-3">
                            <button
                                className="hover:bg-gray-900 p-1 px-2 rounded"
                            >
                                {currentPath.length < 1 
                                    ? "All Packages" 
                                    : currentPath
                                }
                                <span className="ml-2">
                                    <FontAwesomeIcon 
                                        icon={faCaretDown}
                                    />
                                </span>
                            </button>
                        </div>
                        
                        <Divider className="bg-neutral-200"/>
                        
                        <div className="w-11/12 h-full">

                            <div className="px-4 py-2 flex justify-center items-center text-sm text-gray-300">
                                <div className="w-1/3">
                                    <button
                                        className="hover:bg-gray-900 rounded px-2 py-1"
                                        onClick={() => toggleFilter("name")}
                                    >
                                        Name
                                        {filterChevron(filter, "name", order)}
                                    </button>
                                </div>
                                <div className="w-1/6">
                                    <button
                                        className="hover:bg-gray-900 rounded px-2 py-1"
                                        onClick={() => toggleFilter("state")}
                                    >
                                        Status
                                        {filterChevron(filter, "state", order)}
                                    </button>
                                </div>
                                <div className="w-1/6">
                                    <button
                                        className="hover:bg-gray-900 rounded px-2 py-1"
                                        onClick={() => toggleFilter("addon-type")}
                                    >
                                        Type
                                        {filterChevron(filter, "addon-type", order)}
                                    </button>
                                </div>
                                <div className="w-1/6">
                                    <button
                                        className="hover:bg-gray-900 rounded px-2 py-1"
                                        onClick={() => toggleFilter("updatedAt")}
                                    >
                                        Modified
                                        {filterChevron(filter, "updatedAt", order)}
                                    </button>
                                </div>
                                <div className="w-1/6">
                                    <button
                                        className="hover:bg-gray-900 rounded px-2 py-1"
                                        onClick={() => toggleFilter("bytes")}
                                    >
                                        Size
                                        {filterChevron(filter, "bytes", order)}
                                    </button>
                                </div>
                            </div>

                            <Divider className="bg-neutral-200"/>

                            <div className="w-full h-5/6 overflow-y-scroll">
                                {filteredCargos.map((cargo, index) => {
                                    const {name, bytes, updatedAt, id, state} = cargo
                                    const friendlyBytes = readableByteCount(bytes)
                                    const isMod = isAMod(id)
                                    return <div key={`cargo-index-${index}`}>
                                        <button
                                            
                                            className="p-4 w-full text-left flex justify-center items-center hover:bg-neutral-900"
                                        >
                                            <div className="relative z-0 w-1/3">
                                                {((addonState: typeof state, mod: boolean) => {
                                                    switch (addonState) {
                                                        case "update-aborted":
                                                        case "update-failed":
                                                            return <>
                                                            <span className={"mr-3"}>
                                                                <FontAwesomeIcon 
                                                                    icon={faFolder}
                                                                />
                                                            </span>
                                                            <span>
                                                                {name}
                                                            </span>
                                                            <div className="absolute z-10 bottom-0 left-0 text-red-500">
                                                                <FailedAddonIcon
                                                                    style={{fontSize: "12px"}}
                                                                />
                                                            </div>
                                                        </>
                                                        case "updating":
                                                            return <>
                                                                <span className={"mr-3 text-blue-500"}>
                                                                    <FontAwesomeIcon 
                                                                        icon={faFolder}
                                                                    />
                                                                </span>
                                                                <span>
                                                                    {name}
                                                                </span>
                                                                <div className="absolute z-10 bottom-0 left-0">
                                                                    <UpdatingAddonIcon
                                                                        style={{fontSize: "12px"}}
                                                                    />
                                                                </div>
                                                            </>
                                                        default:
                                                            return <>
                                                                <span className={"mr-3 " + (mod ? "text-indigo-500" : "text-green-500")}>
                                                                    <FontAwesomeIcon 
                                                                        icon={faFolder}
                                                                    />
                                                                </span>
                                                                <span>
                                                                    {name}
                                                                </span>
                                                            </>
                                                    }
                                                })(state, isMod)}
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                <span>
                                                    {((addonState: typeof state) => {
                                                        switch (addonState) {
                                                            case "update-aborted":
                                                            case "update-failed":
                                                                return <span className="text-red-500">{"Failed"}</span>
                                                            case "updating":
                                                                return <span className="text-blue-500">{"Updating"}</span>
                                                            default:
                                                                return "Saved"
                                                        }
                                                    })(state)}
                                                </span>
                                            </div>
                                            
                                            <div className={`w-1/6 text-xs ${isMod ? "text-indigo-500" : "text-green-500"}`}>
                                                {isMod ? "mod" : "extension"}
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                {reactiveDate(new Date(updatedAt))}
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                {friendlyBytes.count} {friendlyBytes.metric.toUpperCase()}
                                            </div>
                                        </button>
                                        <Divider className="bg-neutral-200"/>
                                    </div>
                                })}
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </>}
        
    </FullScreenLoadingOverlay>
}

export default AddOns