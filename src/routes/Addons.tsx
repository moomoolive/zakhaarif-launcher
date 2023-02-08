import {useState, useMemo, useRef, useEffect, ReactNode} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FullScreenLoadingOverlay} from "../components/LoadingOverlay"
import {ErrorOverlay} from "../components/ErrorOverlay"
import {
    Button, 
    Tooltip,
    Fab,
    TextField,
    InputAdornment,
    Menu,
    MenuItem
} from "@mui/material"
import {Link, useSearchParams, useNavigate} from "react-router-dom"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faPuzzlePiece, 
    faHardDrive,
    faSignal,
    faArrowLeft,
    faPlus,
    faGear,
    faMagnifyingGlass,
    faBoxesStacked,
    faBars,
} from "@fortawesome/free-solid-svg-icons"
import {toGigabytesString} from "../lib/utils/storage/friendlyBytes"
import {
    Divider, 
    LinearProgress,
    IconButton
} from "@mui/material"
import {useAppShellContext} from "./store"
import {io} from "../lib/monads/result"
import {emptyCargoIndices, CargoState, Shabah, CargoIndices} from "../lib/shabah/downloadClient"
import {Cargo} from "../lib/cargo/index"
import {FilterOrder, FilterChevron} from "../components/FilterChevron"
import FullScreenOverlayLoading from "../components/loadingElements/fullscreenOverlay"
import {lazyComponent} from "../components/Lazy"
import {isMod} from "../lib/utils/cargos"
import type {Permissions} from "../lib/types/permissions"
import { DeepReadonly } from "../lib/types/utility"
import { sleep } from "../lib/utils/sleep"
import type { FileDetails } from "../components/cargo/CargoFileSystem"
import { FileSystemBreadcrumbs } from "../components/cargo/FileSystemBreadcrumbs"
import type {CargoDirectory} from "../components/cargo/CargoFileSystem"

const FileOverlay = lazyComponent(
    async () => (await import("../components/cargo/FileOverlay")).FileOverlay,
    {loadingElement: FullScreenOverlayLoading}
)
const CargoInfo = lazyComponent(
    async () => (await import("../components/cargo/CargoInfo")).CargoInfo,
    {loadingElement: FullScreenOverlayLoading}
)
const Installer = lazyComponent(
    async () => (await import("../components/cargo/Installer")).Installer,
    {loadingElement: FullScreenOverlayLoading}
)
const StatusAlert = lazyComponent(
    async () => (await import("../components/StatusAlert")).StatusAlert
)
const CargoUpdater = lazyComponent(
    async () => (await import("../components/cargo/Updater")).CargoUpdater,
    {loadingElement: FullScreenOverlayLoading}
)
const CargoFileSystem = lazyComponent(
    async () => (await import ("../components/cargo/CargoFileSystem")).CargoFileSystem,
    {}
)
const CargoList = lazyComponent(
    async () => (await import("../components/cargo/CargoList")).CargoList,
    {}
)

const filterOptions = ["updatedAt", "bytes", "state", "addon-type", "name"] as const

const AddOns = (): JSX.Element => {
    const app = useAppShellContext()
    const {downloadClient} = useAppShellContext()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    
    const [loadingInitialData, setLoadingInitialData] = useState(true)
    const [isInErrorState, setIsInErrorState] = useState(false)
    const [cargoIndex, setCargoIndex] = useState<DeepReadonly<CargoIndices>>(emptyCargoIndices())
    const [storageUsage, setStorageUsage] = useState({
        used: 0, total: 0, left: 0
    })
    const [searchText, setSearchText] = useState("")
    const [filter, setFilter] = useState<typeof filterOptions[number]>("updatedAt")
    const [order, setOrder] = useState<FilterOrder>("descending")
    const [viewingCargo, setViewingCargo] = useState("none")
    const [cargoFound, setCargoFound] = useState(false)
    const [viewingCargoIndex, setViewingCargoIndex] = useState(0)
    const [directoryPath, setDirectoryPath] = useState<CargoDirectory[]>([])
    const [fileDetails, setFileDetails] = useState<FileDetails | null>(null)
    const [mobileMainMenuElement, setMobileMainMenuElement] = useState<null | HTMLButtonElement>(null)
    const [showCargoInfo, setShowCargoInfo] = useState(false)
    const [showInstaller, setShowInstaller] = useState(false)
    const [showStatusAlert, setShowStatusAlert] = useState(false)
    const [statusAlertContent, setStatusAlertContent] = useState<ReactNode>("hello world")
    const [statusAlertType, setStatusAlertType] = useState<"info" | "error" | "success" | "warning">("info")
    const [showCargoUpdater, setShowCargoUpdater] = useState(false)

    const viewingCargoBytes = useRef(0)
    const {current: onBackToCargos} = useRef(() => setViewingCargo("none"))
    const {current: toggleFilter} = useRef((filterName: typeof filter) => {
        if (filter !== filterName) {
            setFilter(filterName)
            setOrder("descending")
        } else if (order === "descending") {
            setOrder("ascending")
        } else {
            setOrder("descending")
        }
    })
    const targetCargoRef = useRef(new Cargo<Permissions>())
    const {current: cargoStateToNumber} = useRef((state: CargoState) => {
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
    })

    const totalStorageBytes = useMemo(() => {
        return cargoIndex.cargos.reduce(
            (total, next) => total + next.bytes, 
            0
        )
    }, [cargoIndex])

    const isViewingCargo = viewingCargo !== "none"
    const {current: targetCargo} = targetCargoRef

    useEffectAsync(async () => {
        if (!isViewingCargo) {
            setFilter("updatedAt")
            setOrder("descending")
            return
        }
        const index = cargoIndex.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === viewingCargo
        )
        if (index < 0) {
            setCargoFound(false)
            return
        }
        const targetCargoIndex = cargoIndex.cargos[index]
        const cargo = await downloadClient.getCargoAtUrl(
            targetCargoIndex.resolvedUrl
        )
        if (!cargo.ok) {
            setCargoFound(false)
            return
        }

        
        viewingCargoBytes.current = cargo.data.bytes
        
        targetCargoRef.current = new Cargo(cargo.data.pkg as Cargo<Permissions>)
        setCargoFound(true)
        setFilter("name")
        setOrder("descending")
        setViewingCargoIndex(index)
    }, [viewingCargo])
    
    useEffectAsync(async () => {
        const [cargoIndexRes, clientStorageRes] = await Promise.all([
            io.wrap(downloadClient.getCargoIndices()),
            io.wrap(downloadClient.diskInfo()),
        ] as const)
        setLoadingInitialData(false)
        if (!clientStorageRes.ok || !cargoIndexRes.ok) {
            setIsInErrorState(true)
            return
        }
        setCargoIndex({...cargoIndexRes.data})
        setStorageUsage(clientStorageRes.data)
    }, [])

    const filteredCargos = useMemo(() => {
        if (isViewingCargo) {
            return cargoIndex.cargos
        }
        const orderFactor = order === "ascending" ? 1 : -1
        const copy = []
        for (let i = 0; i < cargoIndex.cargos.length; i++) {
            const targetCargo = cargoIndex.cargos[i]
            if (!targetCargo.name.includes(searchText)) {
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
                    const order = isMod(a) && !isMod(b) ? 1 : -1
                    return order * orderFactor
                })
            case "name":
                return copy.sort((a, b) => {
                    return a.name.localeCompare(b.name) * orderFactor
                })
            default:
                return copy
        }
    }, [filter, order, cargoIndex, searchText, searchParams])

    useEffect(() => {
        const handerId = app.addEventListener("downloadprogress", async (progress) => {
            const {type} = progress
            if (type === "install") {
                return
            }
            console.log("got progress", progress)
            let nextState: CargoState = "cached"
            if (type === "abort") {
                nextState = "update-aborted"
            }
            if (type === "fail") {
                nextState = "update-failed"
            }
            const copy = {...cargoIndex}
            const targetIndexes = progress.canonicalUrls
                .map((url) => copy.cargos.findIndex((cargo) => cargo.canonicalUrl === url))
                .filter((index) => index > -1)
            const {cargos} = copy
            for (const index of targetIndexes) {
                cargos.splice(index, 1, {
                    ...cargos[index], 
                    state: nextState
                })
            }
            await sleep(5_000)
            setCargoIndex(copy)
        })
        return () => { app.removeEventListener("downloadprogress", handerId) }
    })

    const onStats = () => {
        console.info("show stats")
    }

    const onSettings = () => {
        console.info("settings")
    }

    return <FullScreenLoadingOverlay 
        loading={loadingInitialData}
    >
        {isInErrorState ? <ErrorOverlay>
            <div className="text-neutral-400 mb-1">
                An error occurred when search for files
            </div>
            <Link to="/start">
                <Button>
                    Back to Home
                </Button>
            </Link>
        </ErrorOverlay> : <>
            <div className="fixed z-0 w-screen h-screen overflow-clip">
                {fileDetails ? <>
                    <FileOverlay 
                        onClose={() => setFileDetails(null)}
                        {...fileDetails}
                    />
                </> : <></>}

                {showCargoInfo ? <>
                    <CargoInfo
                        onClose={() => setShowCargoInfo(false)}
                        cargo={targetCargo}
                        cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                    />
                </> : <></>}

                {showInstaller ? <>
                    <Installer
                        onClose={() => setShowInstaller(false)}
                        onInstallCargo={async (update, title) => {
                            const status = await downloadClient.executeUpdates(
                                [update],
                                title
                            )
                            console.log("dl status", status)
                            const indexes = await downloadClient.getCargoIndices()
                            setCargoIndex({...indexes})
                            const ok = !(status.data >= Shabah.ERROR_CODES_START)
                            return ok 
                        }}
                        createAlert={(message) => {
                            setStatusAlertContent(message)
                            setStatusAlertType("success")
                            setShowStatusAlert(true)
                        }}
                    />
                </> : <></>}

                {showStatusAlert ? <StatusAlert
                    onClose={() => setShowStatusAlert(false)}
                    autoClose={4_000}
                    color={statusAlertType}
                    content={statusAlertContent}
                    className="fixed left-2 z-20 w-52"
                    style={{top: "91vh"}}
                /> : <></>}

                {isViewingCargo && showCargoUpdater ? <CargoUpdater
                    onClose={() => setShowCargoUpdater(false)}
                    cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                    cargo={targetCargo}
                    createAlert={(message) => {
                        setStatusAlertContent(message)
                        setStatusAlertType("success")
                        setShowStatusAlert(true)
                    }}
                    onUpdateCargo={async (update, title) => {
                        const status = await downloadClient.executeUpdates(
                            [update],
                            title
                        )
                        console.log("update queue status", status)
                        const ok = !(status.data >= Shabah.ERROR_CODES_START)
                        if (!ok) {
                            return false
                        }
                        const indexes = await downloadClient.getCargoIndices()
                        const copy = {...indexes}
                        const targetIndex = copy.cargos.findIndex(
                            (cargo) => cargo.canonicalUrl === cargoIndex.cargos[viewingCargoIndex].canonicalUrl
                        )
                        if (targetIndex < 0) {
                            return true
                        }
                        indexes.cargos.splice(targetIndex, 1, {
                            ...copy.cargos[targetIndex],
                            state: "updating"
                        })
                        setCargoIndex(copy)
                        return true
                    }}
                /> : <></>}

                <div className="w-full relative z-0 sm:h-1/12 flex items-center justify-center">

                    <div className="hidden sm:block w-60">
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
                    </div>

                    <div className="w-11/12 sm:w-4/5">
                        <div className="sm:hidden flex my-2 text-2xl px-1">
                            <div className="w-1/3">
                                <Tooltip title="Menu" placement="left">
                                    <button
                                        onClick={() => navigate("/start")}
                                    >
                                        <FontAwesomeIcon
                                            icon={faArrowLeft}
                                        />
                                    </button>
                                </Tooltip>
                            </div>
                            <div className="w-1/3 text-center">    
                                <span className="text-green-500 mr-2">
                                    <FontAwesomeIcon
                                        icon={faPuzzlePiece}
                                    />
                                </span>
                                <span className="text-base">
                                    {"Add-ons"}
                                </span>
                            </div>
                            <div className="w-1/3 text-right">
                                <Tooltip title="Menu" placement="left">
                                    <button
                                        onClick={(event) => {
                                            setMobileMainMenuElement(event.currentTarget)
                                        }}
                                    >
                                        <FontAwesomeIcon
                                            icon={faBars}
                                        />
                                    </button>
                                </Tooltip>

                                <Menu
                                    anchorEl={mobileMainMenuElement}
                                    open={!!mobileMainMenuElement}
                                    onClose={() => setMobileMainMenuElement(null)}
                                >
                                    <MenuItem
                                        onClick={() => {
                                            console.log("clicked")
                                        }}
                                    >
                                        <span className="mr-4">
                                            <FontAwesomeIcon icon={faBoxesStacked}/>
                                        </span>
                                        Installed
                                    </MenuItem>
                                </Menu>
                            </div>
                        </div>

                        <div className="w-full mb-2 sm:mb-0 sm:w-3/5 sm:ml-1.5">
                            <TextField
                                fullWidth
                                size="small"
                                id="add-ons-search-bar"
                                name="search-bar"
                                className="rounded"
                                placeholder={`${isViewingCargo && cargoFound ? "File, folders" : "Add-on"}...`}
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

                </div>

                <div className="sm:hidden w-11/12 mx-auto">
                    <div className="pb-2 text-xs text-neutral-300">
                        <span className="ml-1 mr-2 text-blue-500">
                            <FontAwesomeIcon 
                                icon={faHardDrive}
                            />
                        </span>

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
                </div>
                
                <div className="w-full relative z-0 h-10/12 sm:h-11/12 flex items-center justify-center">
                    <Divider className="bg-neutral-200"/>

                    <div className="absolute z-20 bottom-2 right-4 sm:hidden">
                        <Tooltip title="New Package" placement="left">
                            <Fab 
                                onClick={() => setShowInstaller(true)}
                                color="primary"
                            >
                                <FontAwesomeIcon 
                                    icon={faPlus}
                                />
                            </Fab>
                        </Tooltip>
                    </div>

                    <div className="hidden sm:block w-60 h-full text-sm">
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
                                <span>
                                    <Fab 
                                        variant="extended" 
                                        sx={{zIndex: "10"}}
                                        onClick={() => setShowInstaller(true)}
                                        color="primary"
                                    >
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
                                </span>
                            </Tooltip>
                        </div>
                        
                        <div className="text-lg pb-4 text-neutral-300 w-11/12 rounded-r-full">
                            <Button 
                                fullWidth 
                                disabled
                                onClick={onStats}
                            >
                                <div className="w-full pl-4 py-1 text-left">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faSignal}
                                        />
                                    </span>
                                    Stats
                                </div>
                            </Button>

                            <Button 
                                fullWidth 
                                disabled
                                onClick={onSettings}
                            >
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

                        <div className="text-lg text-neutral-300 w-11/12 rounded-r-full">
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
                                            ? 3.0
                                            : Math.max(3.0, storageUsage.used / storageUsage.total) 
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

                            <div className="text-xs text-neutral-400">
                                {`${cargoIndex.cargos.length} packages`}
                            </div>
                        </div>

                    </div>
                    
                    <div className="w-11/12 sm:w-4/5 h-full">
                        <Divider className="bg-neutral-200"/>
                        
                        <FileSystemBreadcrumbs 
                            isViewingCargo={isViewingCargo}
                            cargoFound={cargoFound}
                            directoryPath={directoryPath}
                            targetCargo={cargoFound
                                ? cargoIndex.cargos[viewingCargoIndex]
                                : null
                            }
                            onBackToCargos={onBackToCargos}
                            mutateDirectoryPath={setDirectoryPath}
                            onShowCargoInfo={() => setShowCargoInfo(true)}
                            onShowCargoUpdater={() => setShowCargoUpdater(true)}
                            onDeleteCargo={async (canonicalUrl) => {
                                setViewingCargo("none")
                                const copy = [...cargoIndex.cargos]
                                copy.splice(viewingCargoIndex, 1)
                                setCargoIndex({
                                    ...cargoIndex,
                                    cargos: copy
                                })
                                await downloadClient.deleteCargo(canonicalUrl)
                                setStatusAlertContent("Deleted Successfully")
                                setStatusAlertType("success")
                                setShowStatusAlert(true)
                            }}
                        />
                        
                        <Divider className="bg-neutral-200"/>
                        
                        <div className="w-full sm:w-11/12 h-full">

                            <div className="px-4 py-2 flex justify-center items-center text-xs lg:text-base text-neutral-300 mr-3">
                                {isViewingCargo && cargoFound ? <>
                                    <div className="w-1/2">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("name")}
                                        >
                                            Name
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="name"
                                                order={order}
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button disabled className="rounded px-2 py-1">
                                            Type
                                        </button>
                                    </div>
                                    <div className="hidden md:block w-1/6 text-center">
                                        <button disabled className="rounded px-2 py-1">
                                            Modified
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("bytes")}
                                        >
                                            Size
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="bytes"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                </> : <>
                                    <div className="w-1/2 lg:w-1/3">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("name")}
                                        >
                                            Name
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="name"
                                                order={order}
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className={`hidden lg:block w-1/6 text-center`}>
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("state")}
                                        >
                                            Status
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="state"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="hidden md:block w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("addon-type")}
                                        >
                                            Type
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="addon-type"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("updatedAt")}
                                        >
                                            <span className="hidden sm:inline">
                                                Modified
                                            </span>

                                            <span className="sm:hidden">
                                                Date
                                            </span>
                                            
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="updatedAt"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("bytes")}
                                        >
                                            Size
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="bytes"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                </>}
                                
                            </div>

                            <Divider className="bg-neutral-200"/>


                            {isViewingCargo ? <>
                                <div className="w-full h-5/6 overflow-y-scroll text-center animate-fade-in-left">
                                    {!cargoFound ? <>
                                        <div className="text-yellow-500 mt-16 mb-3">
                                            <span className="mr-2">
                                                <FontAwesomeIcon
                                                    icon={faPuzzlePiece}
                                                />
                                            </span>
                                            {"Package not found"}
                                        </div>
                                        <div>
                                            <Button onClick={onBackToCargos} size="large">
                                                Back
                                            </Button>
                                        </div>
                                    </> : <>
                                        <CargoFileSystem 
                                            cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                                            cargo={targetCargo}
                                            searchText={searchText}
                                            cargoBytes={viewingCargoBytes.current}
                                            lastPackageUpdate={cargoIndex.updatedAt}
                                            totalStorageBytes={totalStorageBytes}
                                            filter={filter}
                                            order={order}
                                            directoryPath={directoryPath}
                                            onOpenFileModal={setFileDetails}
                                            onBackToCargos={onBackToCargos}
                                            mutateDirectoryPath={setDirectoryPath}
                                        /> 
                                    </>}
                                </div>
                            </> : <>
                                <CargoList
                                    cargosIndexes={filteredCargos}
                                    hasMore={false}
                                    onViewCargo={setViewingCargo}
                                />
                            </>}
                        </div>
                    </div>
                    
                </div>
            </div>
        </>}
    </FullScreenLoadingOverlay>
}

export default AddOns